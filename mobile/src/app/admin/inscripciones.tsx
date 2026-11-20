import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { File, Paths } from 'expo-file-system';
import { Stack, useFocusEffect } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { AddressInput } from '@/components/address-input';
import { DateField } from '@/components/date-field';
import { C, sans } from '@/constants/theme';
import { canAdmin } from '@/lib/admin';
import { supabase } from '@/lib/supabase';
import { useAdmin } from '@/lib/use-admin';

type EventRow = {
  id: string; nombre: string; titulo: string | null; foto_url: string; orden: number; activa: boolean;
  inscripcion_abierta: boolean; cupo: number | null; fecha_evento: string | null; lugar: string | null;
  creado_at?: string | null; creado_por_nombre?: string | null; modificado_at?: string | null; modificado_por_nombre?: string | null;
};
type Person = { id: string; nombre: string; email: string; telefono: string | null; acompanantes: number; created_at: string };
type Panel = { id: string; kind: 'settings' | 'people' } | null;
const PAGE_SIZE = 25;
const pad = (value: number) => String(value).padStart(2, '0');
const dateValue = (value: string | null) => value ? `${new Date(value).getFullYear()}-${pad(new Date(value).getMonth() + 1)}-${pad(new Date(value).getDate())}` : '';
const timeValue = (value: string | null) => value ? `${pad(new Date(value).getHours())}:${pad(new Date(value).getMinutes())}` : '';
const dateLabel = (value: string | null) => value ? new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)).replace('.', '') : 'Fecha por definir';
const csvCell = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
const safeSearch = (value: string) => value.replace(/[(),%_*]/g, ' ').replace(/\s+/g, ' ').trim();

export default function AdminInscripciones() {
  const { access, ready } = useAdmin();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number | null>>({});
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'open' | 'closed'>('all');
  const [panel, setPanel] = useState<Panel>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [peopleCount, setPeopleCount] = useState(0);
  const [peoplePage, setPeoplePage] = useState(0);
  const [peopleQuery, setPeopleQuery] = useState('');
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draftOpen, setDraftOpen] = useState(false);
  const [draftDate, setDraftDate] = useState('');
  const [draftTime, setDraftTime] = useState('');
  const [draftPlace, setDraftPlace] = useState('');
  const [draftCapacity, setDraftCapacity] = useState('');
  const [exporting, setExporting] = useState(false);

  const canManage = canAdmin(access, 'content', 'edit');
  const load = useCallback(async () => {
    if (!canManage) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.from('destacadas').select('*').order('orden', { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as EventRow[];
      setEvents(rows);
      const next: Record<string, number | null> = {};
      for (let offset = 0; offset < rows.length; offset += 8) {
        const group = await Promise.all(rows.slice(offset, offset + 8).map(async (event) => {
          const result = await supabase.from('inscripciones').select('id', { count: 'exact', head: true }).eq('destacada_id', String(event.id));
          return [event.id, result.error ? null : result.count ?? 0] as const;
        }));
        group.forEach(([id, count]) => { next[id] = count; });
      }
      setCounts(next);
    } catch (error) {
      Alert.alert('No se pudieron cargar las inscripciones', error instanceof Error ? error.message : 'Inténtalo de nuevo.');
    } finally { setLoading(false); setLoaded(true); }
  }, [canManage]);

  useFocusEffect(useCallback(() => { if (access && canManage) void load(); }, [access, canManage, load]));

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('es');
    return events.filter((event) => (!needle || `${event.nombre} ${event.titulo ?? ''}`.toLocaleLowerCase('es').includes(needle))
      && (filter === 'all' || (filter === 'open' ? event.inscripcion_abierta : !event.inscripcion_abierta)));
  }, [events, query, filter]);
  const registrationCount = Object.values(counts).reduce<number>((sum, count) => sum + (count ?? 0), 0);
  const openCount = events.filter((event) => event.inscripcion_abierta).length;

  const openSettings = (event: EventRow) => {
    setPanel({ id: event.id, kind: 'settings' });
    setDraftOpen(Boolean(event.inscripcion_abierta)); setDraftDate(dateValue(event.fecha_evento)); setDraftTime(timeValue(event.fecha_evento));
    setDraftPlace(event.lugar ?? ''); setDraftCapacity(event.cupo ? String(event.cupo) : '');
  };

  const peopleRequest = useRef(0);
  const loadPeople = useCallback(async (eventId: string, page: number, search: string) => {
    const requestId = ++peopleRequest.current;
    setPeopleLoading(true);
    try {
      const term = safeSearch(search);
      let request = supabase.from('inscripciones').select('id,nombre,email,telefono,acompanantes,created_at', { count: 'exact' })
        .eq('destacada_id', String(eventId)).order('created_at', { ascending: false }).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (term) request = request.or(`nombre.ilike.%${term}%,email.ilike.%${term}%,telefono.ilike.%${term}%`);
      const { data, error, count } = await request;
      if (requestId !== peopleRequest.current) return;
      if (error) throw error;
      setPeople((data ?? []) as Person[]); setPeopleCount(count ?? 0); setPeoplePage(page);
    } catch (error) { if (requestId === peopleRequest.current) Alert.alert('No se pudieron cargar los participantes', error instanceof Error ? error.message : 'Inténtalo de nuevo.'); }
    finally { if (requestId === peopleRequest.current) setPeopleLoading(false); }
  }, []);

  const openPeople = (event: EventRow) => {
    if (panel?.id === event.id && panel.kind === 'people') { setPanel(null); return; }
    setPanel({ id: event.id, kind: 'people' }); setPeopleQuery('');
    void loadPeople(event.id, 0, '');
  };

  const saveSettings = async (event: EventRow) => {
    if (!canManage) return Alert.alert('Sin permiso', 'Necesitas permiso para editar el contenido.');
    if (draftCapacity && (!Number.isInteger(Number(draftCapacity)) || Number(draftCapacity) < 1)) return Alert.alert('Cupo no válido', 'Escribe un número entero mayor que cero o deja el campo vacío para no limitarlo.');
    if (draftTime && !/^([01]?\d|2[0-3]):[0-5]\d$/.test(draftTime)) return Alert.alert('Hora no válida', 'Escribe la hora como 18:30.');
    let fecha: string | null = null;
    try { fecha = draftDate ? new Date(`${draftDate}T${draftTime || '00:00'}:00`).toISOString() : null; }
    catch { return Alert.alert('Fecha no válida', 'Selecciona una fecha válida.'); }
    setSaving(true);
    try {
      const { error } = await supabase.from('destacadas').update({ inscripcion_abierta: draftOpen, fecha_evento: fecha, lugar: draftPlace.trim() || null, cupo: draftCapacity ? Number(draftCapacity) : null }).eq('id', event.id);
      if (error) throw error;
      setPanel(null); await load();
      Alert.alert('Evento actualizado', draftOpen ? 'Las inscripciones están abiertas.' : 'Las inscripciones están cerradas.');
    } catch (error) { Alert.alert('No se pudo guardar', error instanceof Error ? error.message : 'Inténtalo de nuevo.'); }
    finally { setSaving(false); }
  };

  const exportCsv = async (event: EventRow) => {
    setExporting(true);
    try {
      const rows: Person[] = [];
      for (let start = 0; ; start += 1000) {
        const { data, error } = await supabase.from('inscripciones').select('id,nombre,email,telefono,acompanantes,created_at').eq('destacada_id', String(event.id)).order('created_at', { ascending: false }).range(start, start + 999);
        if (error) throw error;
        rows.push(...((data ?? []) as Person[]));
        if (!data || data.length < 1000) break;
      }
      const formatDate = (value: string) => new Intl.DateTimeFormat('es', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
      const content = `\uFEFF${[['Nombre', 'Correo', 'Teléfono', 'Acompañantes', 'Fecha'], ...rows.map((person) => [person.nombre, person.email, person.telefono ?? '', person.acompanantes ?? 0, formatDate(person.created_at)])].map((row) => row.map(csvCell).join(',')).join('\n')}`;
      const file = new File(Paths.cache, `inscripciones-${event.id}-${Date.now()}.csv`);
      file.create();
      await file.write(content);
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: `Inscripciones · ${event.nombre}` });
      else Alert.alert('CSV preparado', file.uri);
    } catch (error) { Alert.alert('No se pudo exportar', error instanceof Error ? error.message : 'Inténtalo de nuevo.'); }
    finally { setExporting(false); }
  };

  if (!ready) return <View style={s.center}><ActivityIndicator color={C.wine} /></View>;
  if (!access) return <View style={s.center}><Text style={s.muted}>Inicia sesión para administrar inscripciones.</Text></View>;
  if (access.isRevoked || !canManage) return <View style={[s.root, { padding: 16 }]}><View style={s.empty}><Ionicons name="lock-closed-outline" size={25} color={C.wine} /><Text style={s.emptyTitle}>Acceso de solo lectura</Text><Text style={s.muted}>Para gestionar inscripciones necesitas el permiso de edición de contenidos, igual que en la web.</Text></View></View>;
  if (!loaded) return <View style={s.center}><ActivityIndicator color={C.wine} /></View>;

  return (
    <View style={s.root}>
      <Stack.Screen options={{ title: 'Inscripciones' }} />
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={s.list}
        refreshControl={<RefreshControl refreshing={loading && loaded} onRefresh={() => void load()} tintColor={C.wine} />}
        ListHeaderComponent={<>
          <Text style={s.kicker}>CENTRO DE GESTIÓN</Text>
          <Text style={s.title}>Inscripciones</Text>
          <Text style={s.intro}>Gestiona cupos, fechas y participantes desde la app.</Text>
          <View style={s.stats}>
            <Stat label="Eventos" value={events.length} icon="calendar-outline" />
            <Stat label="Abiertos" value={openCount} icon="person-add-outline" />
            <Stat label="Inscripciones" value={registrationCount} icon="people-outline" />
          </View>
          <View style={s.search}><Ionicons name="search-outline" size={19} color={C.muted} /><TextInput value={query} onChangeText={setQuery} placeholder="Buscar evento…" placeholderTextColor="#a58e88" style={s.searchInput} returnKeyType="search" /></View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filters}>
            {([{ key: 'all', label: 'Todos' }, { key: 'open', label: 'Inscripción abierta' }, { key: 'closed', label: 'Sin inscripción' }] as const).map((item) => <Pressable key={item.key} onPress={() => setFilter(item.key)} style={[s.filter, filter === item.key && s.filterOn]}><Text style={[s.filterText, filter === item.key && s.filterTextOn]}>{item.label}</Text></Pressable>)}
          </ScrollView>
        </>}
        ListEmptyComponent={<View style={s.empty}><Ionicons name="calendar-clear-outline" size={28} color={C.wine} /><Text style={s.emptyTitle}>{events.length ? 'No hay eventos que coincidan' : 'Todavía no hay eventos'}</Text><Text style={s.muted}>{events.length ? 'Prueba otra búsqueda o filtro.' : 'Crea una publicación en Destacadas para habilitar las inscripciones.'}</Text></View>}
        renderItem={({ item }) => {
          const selected = panel?.id === item.id;
          const count = counts[item.id];
          const personPages = Math.max(1, Math.ceil(peopleCount / PAGE_SIZE));
          return <View style={s.eventCard}>
            <View style={s.eventTop}>
              {item.foto_url ? <Image source={{ uri: item.foto_url }} style={s.poster} contentFit="cover" /> : <View style={[s.poster, s.posterBlank]}><Ionicons name="image-outline" size={22} color={C.wine} /></View>}
              <View style={s.eventCopy}>
                <View style={[s.status, item.inscripcion_abierta && s.statusOpen]}><View style={[s.statusDot, item.inscripcion_abierta && s.statusDotOpen]} /><Text style={[s.statusText, item.inscripcion_abierta && s.statusTextOpen]}>{item.inscripcion_abierta ? 'Inscripción abierta' : 'Sin inscripción'}</Text></View>
                <Text style={s.eventTitle}>{item.nombre || item.titulo || 'Evento sin título'}</Text>
                <Text style={s.eventSubtitle} numberOfLines={2}>{item.titulo || 'Actividad de la comunidad'}</Text>
                <Text style={s.meta}>{dateLabel(item.fecha_evento)}{item.lugar ? ` · ${item.lugar}` : ''}</Text>
                <Text style={s.meta}>{count === null ? 'Conteo no disponible' : `${count ?? 0} ${(count ?? 0) === 1 ? 'inscripción' : 'inscripciones'}`}{item.cupo ? ` · ${item.cupo} plazas` : ' · Sin límite'}</Text>
              </View>
            </View>
            <View style={s.actions}>
              <Pressable onPress={() => selected && panel?.kind === 'settings' ? setPanel(null) : openSettings(item)} style={[s.action, selected && panel?.kind === 'settings' && s.actionOn]}><Ionicons name="options-outline" size={17} color={C.wine} /><Text style={s.actionText}>Configurar</Text></Pressable>
              <Pressable onPress={() => openPeople(item)} style={[s.action, selected && panel?.kind === 'people' && s.actionOn]}><Ionicons name="people-outline" size={17} color={C.wine} /><Text style={s.actionText}>Participantes</Text><Text style={s.countPill}>{count ?? '—'}</Text></Pressable>
            </View>
            {selected && panel?.kind === 'settings' ? <View style={s.panel}>
              <View style={s.switchRow}><View style={{ flex: 1 }}><Text style={s.fieldLabel}>Requiere inscripción</Text><Text style={s.help}>{draftOpen ? 'Se mostrará “Inscribirme” en la app.' : 'El evento aparece como anuncio, sin formulario.'}</Text></View><Switch value={draftOpen} onValueChange={setDraftOpen} trackColor={{ true: C.wine, false: '#e5dcda' }} thumbColor="#fff" /></View>
              <View style={s.fields}>
                <View style={{ flex: 1 }}><Text style={s.fieldLabel}>Fecha del evento</Text><DateField value={draftDate} onChange={setDraftDate} title="Fecha del evento" placeholder="Seleccionar fecha" minimumDate={new Date(2000, 0, 1)} maximumDate={new Date(2100, 0, 1)} defaultDate={new Date()} /></View>
                <View style={s.timeField}><Text style={s.fieldLabel}>Hora</Text><TextInput value={draftTime} onChangeText={setDraftTime} placeholder="18:30" placeholderTextColor="#a58e88" style={s.input} keyboardType="numbers-and-punctuation" /></View>
              </View>
              <Text style={s.fieldLabel}>Lugar</Text><AddressInput value={draftPlace} onChangeText={setDraftPlace} />
              <Text style={s.fieldLabel}>Plazas</Text><TextInput value={draftCapacity} onChangeText={(value) => setDraftCapacity(value.replace(/\D/g, ''))} placeholder="Sin límite" placeholderTextColor="#a58e88" style={s.input} keyboardType="number-pad" />
              <Pressable disabled={saving} onPress={() => void saveSettings(item)} style={[s.save, saving && { opacity: 0.55 }]}><Text style={s.saveText}>{saving ? 'Guardando…' : 'Guardar configuración'}</Text></Pressable>
              <Text style={s.audit}>{item.modificado_at ? `Modificado ${dateLabel(item.modificado_at)}${item.modificado_por_nombre ? ` · ${item.modificado_por_nombre}` : ''}` : item.creado_at ? `Agregado ${dateLabel(item.creado_at)}${item.creado_por_nombre ? ` · ${item.creado_por_nombre}` : ''}` : 'Sin registro de cambios anterior al control editorial.'}</Text>
            </View> : null}
            {selected && panel?.kind === 'people' ? <View style={s.panel}>
              <View style={s.peopleHeader}><View style={{ flex: 1 }}><Text style={s.panelTitle}>Participantes</Text><Text style={s.help}>{peopleCount} {peopleCount === 1 ? 'inscripción' : 'inscripciones'}</Text></View><Pressable disabled={exporting || !peopleCount} onPress={() => void exportCsv(item)} style={[s.export, (!peopleCount || exporting) && { opacity: 0.45 }]}><Ionicons name="download-outline" size={17} color={C.wine} /><Text style={s.actionText}>{exporting ? 'Preparando…' : 'Exportar CSV'}</Text></Pressable></View>
              <View style={s.search}><Ionicons name="search-outline" size={18} color={C.muted} /><TextInput value={peopleQuery} onChangeText={(value) => { setPeopleQuery(value); void loadPeople(item.id, 0, value); }} placeholder="Nombre, correo o teléfono" placeholderTextColor="#a58e88" style={s.searchInput} /></View>
              {peopleLoading ? <ActivityIndicator color={C.wine} style={{ padding: 18 }} /> : people.length ? people.map((person) => <View key={person.id} style={s.person}>
                <View style={s.personAvatar}><Text style={s.personInitial}>{person.nombre.trim().charAt(0).toUpperCase() || '?'}</Text></View>
                <View style={{ flex: 1 }}><Text style={s.personName}>{person.nombre}</Text><Text style={s.personMeta} selectable>{person.email}</Text>{person.telefono ? <Text style={s.personMeta} selectable>{person.telefono}</Text> : null}<Text style={s.personMeta}>{Number(person.acompanantes) || 0} acompañantes · {dateLabel(person.created_at)}</Text></View>
              </View>) : <Text style={s.emptyInline}>{peopleQuery ? 'No hay resultados para esta búsqueda.' : 'Este evento aún no tiene inscripciones.'}</Text>}
              <View style={s.pagination}><Text style={s.help}>{peopleCount ? `Página ${peoplePage + 1} de ${personPages}` : 'Sin resultados'}</Text><View style={{ flexDirection: 'row', gap: 8 }}><PageButton icon="chevron-back" disabled={peoplePage <= 0 || peopleLoading} onPress={() => void loadPeople(item.id, peoplePage - 1, peopleQuery)} /><PageButton icon="chevron-forward" disabled={peoplePage + 1 >= personPages || peopleLoading} onPress={() => void loadPeople(item.id, peoplePage + 1, peopleQuery)} /></View></View>
            </View> : null}
          </View>;
        }}
      />
    </View>
  );
}

function Stat({ label, value, icon }: { label: string; value: number; icon: keyof typeof Ionicons.glyphMap }) {
  return <View style={s.stat}><Ionicons name={icon} size={18} color={C.wine} /><Text style={s.statValue}>{value}</Text><Text style={s.statLabel}>{label}</Text></View>;
}
function PageButton({ icon, disabled, onPress }: { icon: keyof typeof Ionicons.glyphMap; disabled: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[s.pageButton, disabled && { opacity: 0.35 }]}><Ionicons name={icon} size={17} color={C.wine} /></Pressable>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg }, list: { padding: 16, paddingBottom: 36, gap: 14 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
  kicker: { fontFamily: sans, fontSize: 12, fontWeight: '700', color: C.wine, letterSpacing: 1.5 }, title: { fontFamily: sans, fontSize: 32, fontWeight: '700', color: C.ink, marginTop: 2 }, intro: { fontFamily: sans, fontSize: 15, lineHeight: 22, color: C.muted, marginTop: 4 },
  stats: { flexDirection: 'row', gap: 8, marginTop: 8 }, stat: { flex: 1, minHeight: 84, padding: 10, borderRadius: 16, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center', gap: 3 }, statValue: { fontFamily: sans, fontSize: 22, fontWeight: '700', color: C.ink }, statLabel: { fontFamily: sans, fontSize: 11, color: C.muted, textAlign: 'center' },
  search: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 13, borderRadius: 14, borderWidth: 1, borderColor: C.separator, backgroundColor: C.card, marginTop: 12 }, searchInput: { flex: 1, minWidth: 0, paddingVertical: 10, fontFamily: sans, fontSize: 15, color: C.ink }, filters: { gap: 8, paddingVertical: 3 }, filter: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, backgroundColor: C.fill }, filterOn: { backgroundColor: C.wine }, filterText: { fontFamily: sans, fontSize: 13, fontWeight: '600', color: C.muted }, filterTextOn: { color: '#fff' },
  eventCard: { backgroundColor: C.card, borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: C.line, shadowColor: '#512e2a', shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 2 }, eventTop: { flexDirection: 'row', gap: 12, padding: 13 }, poster: { width: 82, height: 108, borderRadius: 12, backgroundColor: C.fill }, posterBlank: { alignItems: 'center', justifyContent: 'center' }, eventCopy: { flex: 1, minWidth: 0, gap: 3 }, status: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 20, backgroundColor: '#f2eeed', paddingHorizontal: 9, paddingVertical: 5 }, statusOpen: { backgroundColor: C.blush }, statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.muted }, statusDotOpen: { backgroundColor: C.wine }, statusText: { fontFamily: sans, fontSize: 11, fontWeight: '600', color: C.muted }, statusTextOpen: { color: C.wine }, eventTitle: { fontFamily: sans, fontSize: 17, lineHeight: 21, fontWeight: '700', color: C.ink, marginTop: 3 }, eventSubtitle: { fontFamily: sans, fontSize: 13, lineHeight: 18, color: C.muted }, meta: { fontFamily: sans, fontSize: 11, lineHeight: 16, color: C.muted },
  actions: { flexDirection: 'row', gap: 8, paddingHorizontal: 13, paddingBottom: 13 }, action: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 11, borderRadius: 12, backgroundColor: C.fill }, actionOn: { backgroundColor: C.blush }, actionText: { fontFamily: sans, fontSize: 12, fontWeight: '600', color: C.wine }, countPill: { fontFamily: sans, fontSize: 11, fontWeight: '700', color: C.wine }, panel: { padding: 13, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.separator, gap: 9, backgroundColor: '#fffdfd' }, switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 9 }, fieldLabel: { fontFamily: sans, fontSize: 13, fontWeight: '700', color: C.ink, marginBottom: 5 }, help: { fontFamily: sans, fontSize: 12, lineHeight: 17, color: C.muted }, fields: { flexDirection: 'row', alignItems: 'flex-end', gap: 9 }, timeField: { width: 90 }, input: { minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: C.separator, backgroundColor: '#fffaf9', paddingHorizontal: 12, paddingVertical: 10, fontFamily: sans, fontSize: 15, color: C.ink }, save: { minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: C.wine, marginTop: 3 }, saveText: { fontFamily: sans, fontSize: 14, fontWeight: '700', color: '#fff' }, audit: { fontFamily: sans, fontSize: 11, lineHeight: 16, color: C.muted },
  peopleHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 }, panelTitle: { fontFamily: sans, fontSize: 16, fontWeight: '700', color: C.ink }, export: { flexDirection: 'row', alignItems: 'center', gap: 5, padding: 9, borderRadius: 10, backgroundColor: C.fill }, person: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.separator }, personAvatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: C.blush }, personInitial: { fontFamily: sans, fontSize: 15, fontWeight: '700', color: C.wine }, personName: { fontFamily: sans, fontSize: 14, fontWeight: '700', color: C.ink }, personMeta: { fontFamily: sans, fontSize: 12, lineHeight: 17, color: C.muted }, emptyInline: { paddingVertical: 20, textAlign: 'center', fontFamily: sans, fontSize: 13, color: C.muted }, pagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 5 }, pageButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: C.fill },
  empty: { alignItems: 'center', justifyContent: 'center', gap: 9, padding: 26, marginTop: 12, borderRadius: 18, backgroundColor: C.card }, emptyTitle: { fontFamily: sans, fontSize: 17, fontWeight: '700', color: C.ink, textAlign: 'center' }, muted: { fontFamily: sans, fontSize: 13, lineHeight: 19, color: C.muted, textAlign: 'center' },
});
