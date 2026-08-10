import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  isPickupLocationReady,
  resolvePickupLocation,
} from '../components/PickupLocationPicker';
import { useAuth } from './AuthContext';
import { useRestaurantContext } from './RestaurantContext';
import * as customerService from '../services/customerService';
import {
  customerPreferenceFromSelection,
  listPickupOptions,
  readStoredPickupLocationId,
  selectionFromCustomerPreference,
  writeStoredPickupLocationId,
} from '../services/locationsService';

const PickupLocationContext = createContext(null);

function pickValidId(candidate, options) {
  if (!candidate || !options?.length) return null;
  return options.some((o) => o.id === candidate) ? candidate : null;
}

export function PickupLocationProvider({ children }) {
  const { restaurant } = useRestaurantContext();
  const {
    customerProfile,
    isCustomerAuthenticated,
    patchCustomerProfile,
    refreshCustomerProfile,
  } = useAuth();

  const restaurantId = restaurant?.id || null;
  const [locations, setLocations] = useState([]);
  const [selectedLocationId, setSelectedLocationId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const hydratedProfileIdRef = useRef(null);
  const selectedRef = useRef(null);
  selectedRef.current = selectedLocationId;

  // Load pickup options + local cache whenever restaurant identity changes.
  useEffect(() => {
    if (!restaurant?.id) {
      setLocations([]);
      setSelectedLocationId(null);
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    hydratedProfileIdRef.current = null;

    (async () => {
      try {
        const options = await listPickupOptions(restaurant);
        if (cancelled) return;
        setLocations(options);

        const stored = pickValidId(readStoredPickupLocationId(restaurant.id), options);
        let next = stored;
        if (!next && options.length === 1) next = options[0].id;

        setSelectedLocationId(next);
        if (next) writeStoredPickupLocationId(restaurant.id, next);
      } catch {
        if (!cancelled) {
          setLocations([]);
          setSelectedLocationId(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [restaurant?.id, restaurant?.name, restaurant?.address]);

  // Apply signed-in DB preference when profile is available / changes.
  useEffect(() => {
    if (!isCustomerAuthenticated || !customerProfile?.id || !locations.length) return;
    if (hydratedProfileIdRef.current === customerProfile.id) return;

    const fromProfile = pickValidId(
      selectionFromCustomerPreference(customerProfile),
      locations,
    );
    hydratedProfileIdRef.current = customerProfile.id;

    if (fromProfile) {
      setSelectedLocationId(fromProfile);
      writeStoredPickupLocationId(restaurantId, fromProfile);
      setEditing(false);
      return;
    }

    // Profile has no saved preference: keep local choice; if single store, auto-select.
    let localId = selectedRef.current;
    if (!localId && locations.length === 1) {
      localId = locations[0].id;
      setSelectedLocationId(localId);
      writeStoredPickupLocationId(restaurantId, localId);
    }

    // Promote an existing local/guest choice into the customer profile.
    if (localId && pickValidId(localId, locations)) {
      const preference = customerPreferenceFromSelection(localId);
      customerService
        .updatePreferredPickupLocation(customerProfile.id, preference)
        .then((updated) => {
          if (updated) {
            patchCustomerProfile({
              preferred_pickup_is_main: updated.preferred_pickup_is_main,
              preferred_pickup_location_id: updated.preferred_pickup_location_id,
            });
          }
        })
        .catch(() => {});
    }
  }, [
    isCustomerAuthenticated,
    customerProfile,
    locations,
    restaurantId,
    patchCustomerProfile,
  ]);

  // When auth user signs out, keep localStorage selection (guest continuity).
  useEffect(() => {
    if (!isCustomerAuthenticated) {
      hydratedProfileIdRef.current = null;
    }
  }, [isCustomerAuthenticated]);

  const setPickupLocation = useCallback(async (locationId) => {
    const valid = pickValidId(locationId, locations);
    if (!valid) return false;

    setSelectedLocationId(valid);
    writeStoredPickupLocationId(restaurantId, valid);
    setEditing(false);

    if (isCustomerAuthenticated && customerProfile?.id) {
      try {
        const preference = customerPreferenceFromSelection(valid);
        const updated = await customerService.updatePreferredPickupLocation(
          customerProfile.id,
          preference,
        );
        if (updated) {
          patchCustomerProfile({
            preferred_pickup_is_main: updated.preferred_pickup_is_main,
            preferred_pickup_location_id: updated.preferred_pickup_location_id,
          });
        }
      } catch {
        // Local selection still applies; profile sync can retry on next change.
        try {
          await refreshCustomerProfile?.(restaurantId);
        } catch {
          // ignore
        }
      }
    }
    return true;
  }, [
    locations,
    restaurantId,
    isCustomerAuthenticated,
    customerProfile?.id,
    patchCustomerProfile,
    refreshCustomerProfile,
  ]);

  const selectedLocation = useMemo(
    () => resolvePickupLocation(locations, selectedLocationId),
    [locations, selectedLocationId],
  );

  const hasSelection = isPickupLocationReady(locations, selectedLocationId);
  const needsChoice = locations.length >= 2 && !hasSelection;
  const showChooser = needsChoice || editing;

  const value = useMemo(() => ({
    locations,
    selectedLocationId,
    selectedLocation,
    setPickupLocation,
    hasSelection,
    needsChoice,
    showChooser,
    editing,
    setEditing,
    loading,
  }), [
    locations,
    selectedLocationId,
    selectedLocation,
    setPickupLocation,
    hasSelection,
    needsChoice,
    showChooser,
    editing,
    loading,
  ]);

  return (
    <PickupLocationContext.Provider value={value}>
      {children}
    </PickupLocationContext.Provider>
  );
}

export function usePickupLocation() {
  const ctx = useContext(PickupLocationContext);
  if (!ctx) {
    throw new Error('usePickupLocation must be used inside <PickupLocationProvider>');
  }
  return ctx;
}
