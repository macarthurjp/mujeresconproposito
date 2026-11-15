import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { C, sans, serif } from '@/constants/theme';

import { tapFeedback } from './ui';

const openPrayerForm = () => {
  tapFeedback();
  router.push({ pathname: '/contacto', params: { tema: 'oracion' } });
};

/** "¿Necesitas oración?" card — same design as the website section. */
export function PrayerCard() {
  return (
    <View style={s.card}>
      <LinearGradient colors={['#fffaf8', '#fbe9e4', '#f6dcd5']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={s.head}>
        <View style={s.icon}><MaterialCommunityIcons name="hands-pray" size={26} color="#fff" /></View>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>No tienes que cargarlo sola</Text>
          <Text style={s.copy}>Cuéntanos tu petición. Nuestro equipo orará por ti con cariño y en confidencialidad.</Text>
        </View>
      </View>

      <View style={s.quote}>
        <Text style={s.quoteMark}>“</Text>
        <Text style={s.quoteText}>Echa sobre Él toda tu ansiedad, porque Él tiene cuidado de ti.</Text>
        <Text style={s.quoteRef}>1 Pedro 5:7</Text>
      </View>

      <View style={s.points}>
        {[
          { icon: 'lock-closed-outline', label: 'Confidencial' },
          { icon: 'people-outline', label: 'Equipo de oración' },
          { icon: 'heart-outline', label: 'Con amor' },
        ].map((point) => (
          <View key={point.label} style={s.point}>
            <Ionicons name={point.icon as keyof typeof Ionicons.glyphMap} size={20} color={C.wine} />
            <Text style={s.pointText}>{point.label}</Text>
          </View>
        ))}
      </View>

      <Pressable accessibilityRole="button" onPress={openPrayerForm} style={({ pressed }) => [s.cta, pressed && { transform: [{ scale: 0.98 }], opacity: 0.94 }]}>
        <Ionicons name="create-outline" size={18} color="#fff" />
        <Text style={s.ctaText}>Escríbenos tu petición</Text>
      </Pressable>
    </View>
  );
}

/** Donation header ("Cada aporte es una semilla") — shown on the Aportar screen. */
export function GiveHeader() {
  return (
    <View style={[s.card, { gap: 14 }]}>
      <LinearGradient colors={['#fffaf8', '#fbe9e4', '#f6dcd5']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={s.head}>
        <View style={s.icon}><Ionicons name="heart" size={24} color="#fff" /></View>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Cada aporte es una semilla</Text>
          <Text style={s.copy}>Tu generosidad lleva esperanza, fe y propósito a mujeres alrededor del mundo.</Text>
        </View>
      </View>
      <View style={s.quote}>
        <Text style={s.quoteMark}>“</Text>
        <Text style={s.quoteText}>Dios ama al dador alegre.</Text>
        <Text style={s.quoteRef}>2 Corintios 9:7</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: { borderRadius: 24, overflow: 'hidden', padding: 20, gap: 18, borderWidth: 1, borderColor: 'rgba(201,164,107,0.35)', boxShadow: '0 14px 34px rgba(166,75,67,0.14)' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  icon: { width: 52, height: 52, borderRadius: 16, backgroundColor: C.wine, alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 18px rgba(166,75,67,0.35)' },
  title: { fontFamily: sans, fontSize: 19, fontWeight: '700', letterSpacing: -0.4, color: C.ink },
  copy: { fontFamily: sans, fontSize: 14, lineHeight: 20, color: C.muted, marginTop: 3 },
  quote: { backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: 16, paddingVertical: 14, paddingHorizontal: 16, borderLeftWidth: 3, borderLeftColor: C.gold },
  quoteMark: { fontFamily: serif, fontSize: 40, lineHeight: 40, height: 22, color: C.gold },
  quoteText: { fontFamily: serif, fontStyle: 'italic', fontSize: 19, lineHeight: 26, color: C.ink },
  quoteRef: { fontFamily: sans, fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: C.wine, marginTop: 6 },
  points: { flexDirection: 'row', gap: 8 },
  point: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: 12, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.75)' },
  pointText: { fontFamily: sans, fontSize: 12, fontWeight: '600', color: C.ink, textAlign: 'center' },
  cta: { minHeight: 52, borderRadius: 14, backgroundColor: C.wine, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 10px 24px rgba(166,75,67,0.3)' },
  ctaText: { fontFamily: sans, fontSize: 16, fontWeight: '700', color: '#fff', letterSpacing: -0.2 },
});
