import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Group, Row } from '@/components/form';
import { C, sans } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { canAdmin } from '@/lib/admin';
import { useAdmin } from '@/lib/use-admin';

type Stats = {
  miembros_total: number;
  registros_por_mes: { mes: string; total: number }[];
  por_comunidad: { comunidad: string; total: number }[];
  seguimiento: Partial<Record<'nueva' | 'contactada' | 'integrada' | 'sin_respuesta', number>>;
  dispositivos_app: number;
  devocionales_leidos: { titulo: string; lecturas: number }[];
  unirme_reuniones: { titulo: string; clics: number }[];
  inscripciones: { evento: string; personas: number; cupo: number | null }[];
};

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function Bars({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <View style={s.bars}>
      {data.map((d) => (
        <View key={d.label} style={s.barCol}>
          <Text style={s.barValue}>{d.value || ''}</Text>
          <View style={s.barTrack}><View style={[s.barFill, { height: `${Math.max(4, (d.value / max) * 100)}%` }]} /></View>
          <Text style={s.barLabel}>{d.label}</Text>
        </View>
      ))}
    </View>
  );
}

function Ranked({ rows, unit }: { rows: { label: string; value: number }[]; unit: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <View style={s.card}>
      {rows.map((r, i) => (
        <View key={r.label + i} style={[s.rankRow, i > 0 && s.rankSep]}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.rankLabel} numberOfLines={1}>{r.label}</Text>
            <View style={s.rankTrack}><View style={[s.rankFill, { width: `${(r.value / max) * 100}%` }]} /></View>
          </View>
          <Text style={s.rankValue}>{r.value}<Text style={s.rankUnit}> {unit}</Text></Text>
        </View>
      ))}
    </View>
  );
}

export default function Estadisticas() {
  const { access } = useAdmin();
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const allowed = canAdmin(access, 'dashboard', 'followup');

  const load = useCallback(async () => {
    const { data, error: err } = await supabase.rpc('estadisticas_panel');
    if (err) setError(err.message); else { setStats(data as Stats); setError(null); }
  }, []);

  useEffect(() => {
    if (!allowed) return;
    let alive = true;
    void supabase.rpc('estadisticas_panel').then(({ data, error: err }) => {
      if (!alive) return;
      if (err) setError(err.message); else setStats(data as Stats);
    });
    return () => { alive = false; };
  }, [allowed]);

  if (!allowed) return <ScrollView contentContainerStyle={s.page}><Group footer="Disponible para Super Admin y Manager."><Row icon="lock-closed" label="Sin acceso" chevron={false} /></Group></ScrollView>;

  const months = (() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      return { label: MONTHS[d.getMonth()], value: stats?.registros_por_mes.find((m) => m.mes === key)?.total ?? 0 };
    });
  })();
  const seg = stats?.seguimiento ?? {};

  return (
    <ScrollView contentContainerStyle={s.page} refreshControl={<RefreshControl refreshing={refreshing} tintColor={C.wine} colors={[C.wine]} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
      {error ? <Group footer={error}><Row icon="alert-circle" label="No se pudieron cargar las estadísticas" chevron={false} /></Group> : null}
      {!stats && !error ? <ActivityIndicator color={C.wine} style={{ marginTop: 40 }} /> : null}
      {stats ? <>
        <View style={s.tiles}>
          {[
            { icon: 'people' as const, value: stats.miembros_total, label: 'Miembros registradas' },
            { icon: 'phone-portrait' as const, value: stats.dispositivos_app, label: 'Teléfonos con la app' },
            { icon: 'sparkles' as const, value: seg.nueva ?? 0, label: 'Nuevas sin contactar' },
            { icon: 'heart' as const, value: seg.integrada ?? 0, label: 'Integradas' },
          ].map((t) => (
            <View key={t.label} style={s.tile}>
              <Ionicons name={t.icon} size={16} color={C.wine} />
              <Text style={s.tileValue}>{t.value}</Text>
              <Text style={s.tileLabel}>{t.label}</Text>
            </View>
          ))}
        </View>

        <Text style={s.section}>Registros por mes</Text>
        <View style={s.card}><Bars data={months} /></View>

        <Text style={s.section}>Por comunidad</Text>
        <Ranked rows={stats.por_comunidad.map((c) => ({ label: c.comunidad, value: c.total }))} unit="" />

        <Text style={s.section}>Devocionales más leídos · 30 días</Text>
        {stats.devocionales_leidos.length ? <Ranked rows={stats.devocionales_leidos.map((d) => ({ label: d.titulo, value: d.lecturas }))} unit="lecturas" /> : <Text style={s.empty}>Aún no hay lecturas registradas.</Text>}

        <Text style={s.section}>“Unirme” en reuniones · 30 días</Text>
        {stats.unirme_reuniones.length ? <Ranked rows={stats.unirme_reuniones.map((u) => ({ label: u.titulo, value: u.clics }))} unit="veces" /> : <Text style={s.empty}>Aún no hay datos.</Text>}

        <Text style={s.section}>Inscripciones a eventos</Text>
        {stats.inscripciones.length ? <Ranked rows={stats.inscripciones.map((e) => ({ label: e.cupo ? `${e.evento} (de ${e.cupo})` : e.evento, value: e.personas }))} unit="personas" /> : <Text style={s.empty}>No hay eventos con inscripción.</Text>}

        <Text style={s.foot}>Las lecturas y los “Unirme” se cuentan de forma anónima, sin datos personales.</Text>
      </> : null}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { padding: 16, paddingBottom: 60 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { flexBasis: '47%', flexGrow: 1, padding: 14, borderRadius: 16, backgroundColor: C.card, gap: 4 },
  tileValue: { fontFamily: sans, fontSize: 26, fontWeight: '700', color: C.ink, fontVariant: ['tabular-nums'] },
  tileLabel: { fontFamily: sans, fontSize: 12, color: C.muted },
  section: { fontFamily: sans, fontSize: 13, fontWeight: '700', color: C.ink, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 26, marginBottom: 10, marginLeft: 4 },
  card: { backgroundColor: C.card, borderRadius: 16, padding: 14 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, height: 150 },
  barCol: { flex: 1, alignItems: 'center', gap: 4, height: '100%' },
  barValue: { fontFamily: sans, fontSize: 11, fontWeight: '700', color: C.ink },
  barTrack: { flex: 1, width: '70%', justifyContent: 'flex-end' },
  barFill: { width: '100%', borderRadius: 6, backgroundColor: C.wine },
  barLabel: { fontFamily: sans, fontSize: 11, color: C.muted },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  rankSep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.separator },
  rankLabel: { fontFamily: sans, fontSize: 14, color: C.ink },
  rankTrack: { height: 5, borderRadius: 3, backgroundColor: C.fill, marginTop: 6, overflow: 'hidden' },
  rankFill: { height: '100%', borderRadius: 3, backgroundColor: C.wine },
  rankValue: { fontFamily: sans, fontSize: 16, fontWeight: '700', color: C.ink, fontVariant: ['tabular-nums'] },
  rankUnit: { fontSize: 11, fontWeight: '500', color: C.muted },
  empty: { fontFamily: sans, fontSize: 13, color: C.muted, marginLeft: 4 },
  foot: { fontFamily: sans, fontSize: 12, color: C.muted, textAlign: 'center', marginTop: 24 },
});
