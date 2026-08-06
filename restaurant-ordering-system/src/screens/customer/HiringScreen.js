/**
 * HiringScreen — careers / job application placeholder.
 * Matches the reference layout: headline, "Why work with us?", location,
 * application form (name, email, phone, comment, file), submit alert.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRestaurantContext } from '../../context/RestaurantContext';
import { useTheme } from '../../theme';
import { submitApplication } from '../../services/applicationsService';
import { uploadApplicationPDF } from '../../services/storageService';

function genFileId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const DESKTOP_BP = 768;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_RESUME_BYTES = 5 * 1024 * 1024; // 5 MB

export default function HiringScreen({ navigation }) {
  const { restaurant } = useRestaurantContext();
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const isDesktop = width >= DESKTOP_BP;

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [comment, setComment] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileObj, setFileObj] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});

  const clearError = (key) => {
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleFileChange = (e) => {
    const f = e?.target?.files?.[0];
    if (!f) return;

    const isPdf =
      f.type === 'application/pdf' ||
      (f.name || '').toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      setFileName('');
      setFileObj(null);
      setErrors((prev) => ({ ...prev, resume: 'Resume must be a PDF file.' }));
      e.target.value = '';
      return;
    }
    if (f.size > MAX_RESUME_BYTES) {
      setFileName('');
      setFileObj(null);
      setErrors((prev) => ({ ...prev, resume: 'Resume must be 5 MB or smaller.' }));
      e.target.value = '';
      return;
    }

    setFileName(f.name);
    setFileObj(f);
    clearError('resume');
  };

  const validate = () => {
    const errs = {};
    if (!name.trim()) errs.name = 'Name is required';
    if (!email.trim()) {
      errs.email = 'Email is required';
    } else if (!EMAIL_RE.test(email.trim())) {
      errs.email = 'Enter a valid email address';
    }
    const digits = phone.replace(/\D/g, '');
    if (!phone.trim()) {
      errs.phone = 'Phone number is required';
    } else if (digits.length < 10) {
      errs.phone = 'Enter a valid phone number (at least 10 digits)';
    }
    if (!comment.trim() && !fileObj) {
      errs.resume = 'Please provide a comment or attach your resume (PDF).';
    }
    return errs;
  };

  const handleSubmit = async () => {
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors({});

    setSubmitting(true);
    try {
      let resumePath = null;
      let resumeFileName = null;

      if (fileObj && restaurant?.id) {
        const fileId = genFileId();
        const result = await uploadApplicationPDF({
          restaurantId: restaurant.id,
          fileId,
          file: fileObj,
        });
        resumePath = result.path;
        resumeFileName = fileName;
      }

      await submitApplication({
        restaurantId: restaurant?.id,
        fullName: name.trim(),
        email: email.trim(),
        phone: phone.trim() || null,
        comment: comment.trim() || null,
        resumePath,
        resumeFileName,
      });

      setSubmitted(true);
    } catch (e) {
      Alert.alert('Submission Error', e.message || 'Could not submit your application. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <View style={[s.root, { backgroundColor: '#fff' }]}>
        <View style={s.successWrap}>
          <Ionicons name="checkmark-circle-outline" size={64} color={theme.colors.brand} />
          <Text style={[s.successTitle, { color: '#111' }]}>Application Received!</Text>
          <Text style={s.successSub}>
            Thank you for your interest in joining {restaurant?.name || 'our team'}. We'll review your application and be in touch.
          </Text>
          <TouchableOpacity
            style={[s.backBtn, { borderColor: theme.colors.brand }]}
            onPress={() => navigation?.navigate('Home')}
          >
            <Text style={[s.backBtnText, { color: theme.colors.brand }]}>Back to Home</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={[s.root, { backgroundColor: '#fff' }]}
      contentContainerStyle={s.content}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Header ──────────────────────────────────── */}
      <View style={s.header}>
        <Text style={s.headline}>Join a growing team with{'\n'}a love for food</Text>
      </View>

      {/* ── Two-column body ─────────────────────────── */}
      <View style={[s.body, isDesktop && s.bodyDesktop]}>

        {/* Left: Why work with us */}
        <View style={[s.leftCol, isDesktop && s.leftColDesktop]}>
          <View style={[s.whyCard, { backgroundColor: '#f4f4f4' }]}>
            <Text style={s.whyTitle}>Why work with us?</Text>
            <Text style={s.whyBody}>
              We are always hiring A players who work hard, love helping others, and do great work.
              Fill out the 2 minute form with your resume and a few sentences about you.
            </Text>

            {/* Location */}
            <View style={s.locationWrap}>
              <Text style={s.locationLabel}>Location</Text>
              <View style={[s.locationCard, { backgroundColor: '#fff' }]}>
                <View style={s.locationRadio}>
                  <View style={[s.radioOuter]}>
                    <View style={[s.radioInner, { backgroundColor: theme.colors.brand }]} />
                  </View>
                  <View>
                    <Text style={s.locationName}>{restaurant?.name || 'Restaurant'}</Text>
                    <Text style={s.locationAddr}>{restaurant?.address || '–'}</Text>
                  </View>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Right: Application form */}
        <View style={[s.rightCol, isDesktop && s.rightColDesktop]}>
          <View style={[s.formCard, { backgroundColor: '#f4f4f4' }]}>
            <Text style={s.formTitle}>Application</Text>

            <Text style={s.fieldLabel}>Full name</Text>
            <TextInput
              style={[s.input, errors.name && s.inputError]}
              value={name}
              onChangeText={(v) => { setName(v); clearError('name'); }}
              placeholder="Your name"
              autoCapitalize="words"
            />
            {errors.name ? <Text style={s.errorText}>{errors.name}</Text> : null}

            <Text style={s.fieldLabel}>Email</Text>
            <TextInput
              style={[s.input, errors.email && s.inputError]}
              value={email}
              onChangeText={(v) => { setEmail(v); clearError('email'); }}
              placeholder="Email"
              keyboardType="email-address"
              autoCapitalize="none"
            />
            {errors.email ? <Text style={s.errorText}>{errors.email}</Text> : null}

            <Text style={s.fieldLabel}>Phone number</Text>
            <TextInput
              style={[s.input, errors.phone && s.inputError]}
              value={phone}
              onChangeText={(v) => { setPhone(v); clearError('phone'); }}
              placeholder="(555) 555-5555"
              keyboardType="phone-pad"
            />
            {errors.phone ? <Text style={s.errorText}>{errors.phone}</Text> : null}

            <Text style={s.fieldLabel}>Comment</Text>
            <TextInput
              style={[s.input, s.textArea, errors.resume && !fileObj && s.inputError]}
              value={comment}
              onChangeText={(v) => { setComment(v); clearError('resume'); }}
              placeholder="Anything to share as we consider your application?"
              multiline
              numberOfLines={4}
            />

            <Text style={s.fieldLabel}>Attachment</Text>
            {Platform.OS === 'web' ? (
              <View style={[s.fileRow, { backgroundColor: '#fff' }, errors.resume && s.inputError]}>
                <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    padding: '8px 14px',
                    background: '#e3e3e3',
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#333',
                    cursor: 'pointer',
                  }}>
                    Choose File
                  </span>
                  <span style={{ fontSize: 13, color: '#777' }}>
                    {fileName || 'No file chosen'}
                  </span>
                  <input
                    type="file"
                    accept=".pdf,application/pdf"
                    style={{ display: 'none' }}
                    onChange={handleFileChange}
                  />
                </label>
              </View>
            ) : (
              <View style={[s.fileRow, { backgroundColor: '#fff' }, errors.resume && s.inputError]}>
                <Text style={s.fileText}>File upload available on web</Text>
              </View>
            )}
            {errors.resume ? <Text style={s.errorText}>{errors.resume}</Text> : null}
            <Text style={s.fileHint}>
              Upload a PDF resume (max 5 MB). Either a comment or an attachment is required.
            </Text>

            <TouchableOpacity
              style={[s.submitBtn, { backgroundColor: theme.colors.brand }, submitting && { opacity: 0.65 }]}
              onPress={handleSubmit}
              activeOpacity={0.85}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Text style={s.submitText}>Submit</Text>
                  <Ionicons name="chevron-forward" size={16} color="#fff" />
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingBottom: 60 },

  // Header
  header: {
    paddingHorizontal: 24,
    paddingVertical: 40,
    alignItems: 'center',
  },
  headline: {
    fontSize: 30,
    fontWeight: '900',
    color: '#111',
    textAlign: 'center',
    lineHeight: 38,
  },

  // Body
  body: { paddingHorizontal: 20, gap: 20, paddingBottom: 20 },
  bodyDesktop: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 40, maxWidth: 1000, alignSelf: 'center', width: '100%' },

  // Columns
  leftCol: {},
  leftColDesktop: { flex: 4 },
  rightCol: {},
  rightColDesktop: { flex: 6 },

  // Why card
  whyCard: {
    borderRadius: 12,
    padding: 20,
  },
  whyTitle: { fontSize: 17, fontWeight: '700', color: '#111', marginBottom: 10 },
  whyBody: { fontSize: 14, color: '#444', lineHeight: 21 },

  // Location inside why card
  locationWrap: { marginTop: 20 },
  locationLabel: { fontSize: 12, color: '#888', fontWeight: '600', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 },
  locationCard: { borderRadius: 10, padding: 14 },
  locationRadio: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  radioOuter: {
    width: 18, height: 18, borderRadius: 9,
    borderWidth: 2, borderColor: '#aaa',
    alignItems: 'center', justifyContent: 'center',
  },
  radioInner: { width: 9, height: 9, borderRadius: 5 },
  locationName: { fontSize: 14, fontWeight: '700', color: '#111' },
  locationAddr: { fontSize: 12, color: '#666', marginTop: 2 },

  // Form card
  formCard: { borderRadius: 12, padding: 20 },
  formTitle: { fontSize: 16, fontWeight: '700', color: '#111', marginBottom: 14 },

  // Fields
  fieldLabel: { fontSize: 13, fontWeight: '500', color: '#444', marginBottom: 5, marginTop: 12 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 11,
    fontSize: 14,
    color: '#222',
  },
  inputError: { borderColor: '#c0392b' },
  errorText: { fontSize: 12, color: '#c0392b', marginTop: 4 },
  textArea: { height: 96, textAlignVertical: 'top' },

  // File
  fileRow: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 11,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
  },
  fileText: { fontSize: 13, color: '#888' },
  fileHint: { fontSize: 11, color: '#999', marginTop: 5, lineHeight: 16 },

  // Submit
  submitBtn: {
    marginTop: 18,
    borderRadius: 10,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // Success
  successWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    gap: 16,
  },
  successTitle: { fontSize: 24, fontWeight: '800' },
  successSub: { fontSize: 15, textAlign: 'center', color: '#555', lineHeight: 22, maxWidth: 360 },
  backBtn: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 2,
  },
  backBtnText: { fontSize: 15, fontWeight: '700' },
});
