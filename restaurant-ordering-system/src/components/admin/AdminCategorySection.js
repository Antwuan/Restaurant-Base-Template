// Admin category section — mirrors the customer CategorySection layout
// (same header style, same 2-column grid) but wraps items in a DnD sortable
// context so they can be dragged to reorder. Each section manages its own
// DndContext so drags stay local to the category.
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import AdminMenuItem from './AdminMenuItem';

const DESKTOP_BREAKPOINT = 768;

// Sortable wrapper for each item cell — renders as a div on web so
// @dnd-kit's pointer listeners and CSS transforms work correctly.
function SortableItemCell({ id, isDesktop, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const divStyle = {
    width: isDesktop ? 'calc(50% - 6px)' : '100%',
    flexShrink: 0,
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
    zIndex: isDragging ? 100 : 0,
    position: 'relative',
  };

  return (
    <div ref={setNodeRef} style={divStyle} {...attributes}>
      {children(listeners)}
    </div>
  );
}

export default function AdminCategorySection({
  category,
  items,
  onEdit,
  onToggleAvailability,
  togglingId,
  onItemsReordered,
  onEditCategory,
}) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= DESKTOP_BREAKPOINT;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(items, oldIndex, newIndex);
    onItemsReordered(category.id, reordered.map((i) => i.id));
  };

  return (
    <View style={styles.container}>
      {/* Category header — mirrors CategorySection's headerText style */}
      <View style={styles.headerRow}>
        <Text style={styles.headerText}>{category.name}</Text>
        {onEditCategory && (
          <TouchableOpacity
            style={styles.editCatBtn}
            onPress={() => onEditCategory(category)}
            accessibilityLabel={`Edit ${category.name} category`}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Ionicons name="pencil-outline" size={14} color="#9ca3af" />
          </TouchableOpacity>
        )}
      </View>

      {/* Items grid */}
      {items.length === 0 ? (
        <View style={styles.emptyCategory}>
          <Text style={styles.emptyCategoryText}>No items in this category yet.</Text>
        </View>
      ) : Platform.OS === 'web' ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={items.map((i) => i.id)}
            strategy={rectSortingStrategy}
          >
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 12,
              }}
            >
              {items.map((item) => (
                <SortableItemCell key={item.id} id={item.id} isDesktop={isDesktop}>
                  {(dragListeners) => (
                    <AdminMenuItem
                      item={item}
                      onEdit={onEdit}
                      onToggleAvailability={onToggleAvailability}
                      toggling={togglingId === item.id}
                      dragHandleListeners={dragListeners}
                    />
                  )}
                </SortableItemCell>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        // Native fallback — no DnD, just a plain grid
        <View style={[styles.grid, isDesktop && styles.gridDesktop]}>
          {items.map((item) => (
            <View key={item.id} style={[styles.cell, isDesktop && styles.cellDesktop]}>
              <AdminMenuItem
                item={item}
                onEdit={onEdit}
                onToggleAvailability={onToggleAvailability}
                toggling={togglingId === item.id}
                dragHandleListeners={null}
              />
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 36,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  headerText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1a1a1a',
    flex: 1,
  },
  editCatBtn: {
    padding: 4,
    borderRadius: 6,
    backgroundColor: '#f3f4f6',
  },
  emptyCategory: {
    paddingVertical: 24,
    paddingHorizontal: 16,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  emptyCategoryText: {
    fontSize: 13,
    color: '#9ca3af',
  },
  // Native fallback grid
  grid: {
    flexDirection: 'column',
    gap: 12,
  },
  gridDesktop: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: '100%',
  },
  cellDesktop: {
    width: 'calc(50% - 6px)',
  },
});
