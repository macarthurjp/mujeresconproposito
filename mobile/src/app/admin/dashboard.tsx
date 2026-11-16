import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import { Stack, useFocusEffect } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useCallback, useMemo, useState } from 'react';
import { ActionSheetIOS, ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { AdminLogin } from '@/components/admin-login';
import { FieldRow, Group, InputRow, Row } from '@/components/form';
import { C, sans } from '@/constants/theme';
import { formOptions } from '@/lib/form-options';
import { canAdmin } from '@/lib/admin';
import { supabase } from '@/lib/supabase';
import { useAdmin } from '@/lib/use-admin';
import { WheelPicker, type WheelOption } from '@/components/wheel-picker';

type Member = {
  id: number;
  created_at: string;
  nombre: string;
  apellido: string;
  email: string | null;
  telefono: string | null;
  pais_residencia: string;
  comunidad: string;
  cristiana: string;
  fecha_nacimiento: string | null;
  pais_nacimiento: string | null;
  estatus_matrimonial: string | null;
  hijos: number | null;
  comments: string | null;
  ultimo_correo_cumpleanos?: string | null;
};

type MemberForm = {
  nombre: string; apellido: string; email: string; telefono: string; pais_residencia: string;
  comunidad: string; cristiana: string; fecha_nacimiento: string; pais_nacimiento: string;
  estatus_matrimonial: string; hijos: number; comments: string;
};
const countryOptions: WheelOption[] = formOptions.countries.map((country) => ({ value: country, label: country }));
const communityOptions: WheelOption[] = formOptions.communities.map((community) => ({ value: community, label: community }));
const faithOptions: WheelOption[] = formOptions.christianStatuses.map((status) => ({ value: status, label: status }));
const maritalOptions: WheelOption[] = formOptions.maritalStatuses.map((status) => ({ value: status, label: status }));
function withLegacyOption(options: WheelOption[], value: string) {
  return value && !options.some((option) => option.value === value) ? [...options, { value, label: `${value} (valor actual)` }] : options;
}

function memberDate(value: string | null) {
  if (!value) return '—';
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

function csvCell(value: unknown) { return `"${String(value ?? '').replaceAll('"', '""')}"`; }
function escapeHtml(value: unknown) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function birthdayInDays(dateValue: string | null, now: Date) {
  if (!dateValue) return null;
  const match = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const month = Number(match[2]);
  const day = Number(match[3]);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (let offset = 0; offset <= 366; offset += 1) {
    const candidate = new Date(today);
    candidate.setDate(today.getDate() + offset);
    if (candidate.getMonth() + 1 === month && candidate.getDate() === day) return offset;
  }
  return null;
}

function fmtDate(value: string | null) {
  if (!value) return '—';
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long' }).format(date);
}

function Stat({ icon, label, value, tint }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: number; tint: string }) {
  return (
    <View style={s.stat}>
      <View style={[s.statIcon, { backgroundColor: tint }]}><Ionicons name={icon} size={18} color={C.wine} /></View>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

export default function AdminDashboard() {
  const { access, ready } = useAdmin();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [countryFilter, setCountryFilter] = useState('');
  const [communityFilter, setCommunityFilter] = useState('');
  const [faithFilter, setFaithFilter] = useState('');
  const [sortMode, setSortMode] = useState('newest');
  const [pageSize, setPageSize] = useState('25');
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [memberForm, setMemberForm] = useState<MemberForm>({
    nombre: '', apellido: '', email: '', telefono: '', pais_residencia: '', comunidad: '', cristiana: '',
    fecha_nacimiento: '', pais_nacimiento: '', estatus_matrimonial: '', hijos: 0, comments: '',
  });
  const [savingMember, setSavingMember] = useState(false);
  const [exporting, setExporting] = useState<'csv' | 'pdf' | null>(null);
  const [showBirthDatePicker, setShowBirthDatePicker] = useState(false);

  const load = useCallback(async () => {
    if (!canAdmin(access,'dashboard','view')) return;
    setLoading(true);
    try {
      const canReadPrivate = access?.isSuperAdmin || access?.permissions.includes('read_export');
      const result = canReadPrivate
        ? await supabase.from('unirse').select('*').order('created_at', { ascending: false }).range(0, 9999)
        : await supabase.rpc('admin_dashboard_members');
      const { data, error } = result;
      if (error) throw error;
      setMembers((data ?? []) as Member[]);
    } catch (error) {
      Alert.alert('No se pudieron cargar los registros', error instanceof Error ? error.message : 'Inténtalo de nuevo.');
    } finally { setLoading(false); }
  }, [access]);

  useFocusEffect(useCallback(() => {
    if (access && canAdmin(access,'dashboard','view')) void load();
  }, [access, load]));

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('es');
    const result = members.filter((member) => (!needle || [member.nombre, member.apellido, member.email, member.telefono, member.pais_residencia, member.comunidad]
      .some((value) => String(value ?? '').toLocaleLowerCase('es').includes(needle)))
      && (!countryFilter || member.pais_residencia === countryFilter)
      && (!communityFilter || member.comunidad === communityFilter)
      && (!faithFilter || member.cristiana === faithFilter));
    const cmp = (a: string, b: string) => a.localeCompare(b, 'es', { sensitivity: 'base' });
    result.sort((a, b) => {
      if (sortMode === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (sortMode === 'name-asc') return cmp(`${a.nombre} ${a.apellido}`, `${b.nombre} ${b.apellido}`);
      if (sortMode === 'name-desc') return cmp(`${b.nombre} ${b.apellido}`, `${a.nombre} ${a.apellido}`);
      if (sortMode === 'country') return cmp(a.pais_residencia, b.pais_residencia);
      if (sortMode === 'community') return cmp(a.comunidad, b.comunidad);
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    return result;
  }, [members, query, countryFilter, communityFilter, faithFilter, sortMode]);
  const size = Number(pageSize);
  const visible = filtered.slice(page * size, page * size + size);
  const now = new Date();
  const currentMonth = now.getMonth();
  const monthly = members.filter((member) => {
    const date = new Date(member.created_at);
    return date.getFullYear() === now.getFullYear() && date.getMonth() === currentMonth;
  }).length;
  const countries = new Set(members.map((member) => member.pais_residencia).filter(Boolean)).size;
  const communities = new Set(members.map((member) => member.comunidad).filter(Boolean)).size;
  const communityCounts = [...members.reduce((counts, member) => counts.set(member.comunidad || 'Sin comunidad', (counts.get(member.comunidad || 'Sin comunidad') || 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]);
  const countryFilterOptions: WheelOption[] = [{ value: '', label: 'Todos los países' }, ...[...new Set(members.map((member) => member.pais_residencia).filter(Boolean))].sort().map((value) => ({ value, label: value }))];
  const communityFilterOptions: WheelOption[] = [{ value: '', label: 'Todas las comunidades' }, ...[...new Set(members.map((member) => member.comunidad).filter(Boolean))].sort().map((value) => ({ value, label: value }))];
  const faithFilterOptions: WheelOption[] = [{ value: '', label: 'Todas' }, ...faithOptions];
  const sortOptions: WheelOption[] = [
    { value: 'newest', label: 'Más recientes' }, { value: 'oldest', label: 'Más antiguos' },
    { value: 'name-asc', label: 'Nombre A–Z' }, { value: 'name-desc', label: 'Nombre Z–A' },
    { value: 'country', label: 'País' }, { value: 'community', label: 'Comunidad' },
  ];
  const sizeOptions: WheelOption[] = [{ value: '10', label: '10 por página' }, { value: '25', label: '25 por página' }, { value: '50', label: '50 por página' }];
  const birthdays = members
    .map((member) => ({ member, days: birthdayInDays(member.fecha_nacimiento, now) }))
    .filter((entry): entry is { member: Member; days: number } => entry.days !== null && entry.days <= 30)
    .sort((a, b) => a.days - b.days)
    .slice(0, 8);
  const countryPickerOptions = memberForm.pais_residencia && !countryOptions.some((option) => option.value === memberForm.pais_residencia)
    ? [...countryOptions, { value: memberForm.pais_residencia, label: `${memberForm.pais_residencia} (valor actual)` }]
    : countryOptions;
  const birthCountryPickerOptions = memberForm.pais_nacimiento && !countryOptions.some((option) => option.value === memberForm.pais_nacimiento)
    ? [...countryOptions, { value: memberForm.pais_nacimiento, label: `${memberForm.pais_nacimiento} (valor actual)` }]
    : countryOptions;
  const communityPickerOptions = withLegacyOption(communityOptions, memberForm.comunidad);
  const faithPickerOptions = withLegacyOption(faithOptions, memberForm.cristiana);
  const maritalPickerOptions = withLegacyOption(maritalOptions, memberForm.estatus_matrimonial);
  const birthPickerDate = /^\d{4}-\d{2}-\d{2}$/.test(memberForm.fecha_nacimiento)
    ? new Date(`${memberForm.fecha_nacimiento}T12:00:00`)
    : new Date(1990, 0, 1, 12);
  const latestAdultBirthDate = new Date(now.getFullYear() - 18, now.getMonth(), now.getDate());

  if (!ready) return <View style={s.center}><ActivityIndicator color={C.wine} /></View>;
  if (!access) return <AdminLogin />;
  if (access.isRevoked) return <View style={s.page}><Group footer="Contacta a la administración si crees que es un error."><Row icon="ban" label="Acceso revocado" chevron={false} /></Group></View>;
  if (!canAdmin(access,'dashboard','view')) return <View style={s.page}><Group><Row icon="lock-closed" label="Tu cuenta no tiene acceso al dashboard." chevron={false} /></Group></View>;

  const canExport = access.isSuperAdmin || access.permissions.includes('read_export');
  const canReadPrivate = canExport;
  const canManageRecords = access.isSuperAdmin;
  const openMember = (member: Member) => {
    if (!canManageRecords) {
      const detail = [
        `Residencia: ${member.pais_residencia || '—'}`,
        `Comunidad: ${member.comunidad || '—'}`, `Cristiana: ${member.cristiana || '—'}`,
        ...(canReadPrivate ? [member.email || '', member.telefono || '', `Nacimiento: ${fmtDate(member.fecha_nacimiento)}`, `País de nacimiento: ${member.pais_nacimiento || '—'}`] : []),
      ].filter(Boolean).join('\n');
      const buttons = [
        canReadPrivate && member.email ? { text: 'Correo', onPress: () => { void Linking.openURL(`mailto:${member.email}`); } } : null,
        canReadPrivate && member.telefono ? { text: 'Llamar', onPress: () => { void Linking.openURL(`tel:${member.telefono!.replace(/[^+\d]/g, '')}`); } } : null,
        canReadPrivate && member.telefono ? { text: 'WhatsApp', onPress: () => { void Linking.openURL(`https://wa.me/${member.telefono!.replace(/\D/g, '')}`); } } : null,
      ].filter((button): button is { text: string; onPress: () => void } => button !== null);
      Alert.alert(`${member.nombre} ${member.apellido}`.trim(), detail, buttons);
      return;
    }
    setMemberForm({
      nombre: member.nombre ?? '', apellido: member.apellido ?? '', email: member.email ?? '', telefono: member.telefono ?? '',
      pais_residencia: member.pais_residencia ?? '', comunidad: member.comunidad ?? '', cristiana: member.cristiana ?? '',
      fecha_nacimiento: String(member.fecha_nacimiento ?? '').slice(0, 10), pais_nacimiento: member.pais_nacimiento ?? '',
      estatus_matrimonial: member.estatus_matrimonial ?? '', hijos: Number(member.hijos) || 0, comments: member.comments ?? '',
    });
    setShowBirthDatePicker(false);
    setEditingMember(member);
  };
  const closeMemberEditor = () => { if (!savingMember) setEditingMember(null); };
  const updateForm = <K extends keyof MemberForm>(key: K, value: MemberForm[K]) => setMemberForm((current) => ({ ...current, [key]: value }));
  const handleBirthDateChange = (event: DateTimePickerEvent, date?: Date) => {
    if (date) updateForm('fecha_nacimiento', `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`);
    if (Platform.OS !== 'ios' || event.type === 'dismissed') setShowBirthDatePicker(false);
  };

  const saveMember = async () => {
    if (!editingMember || savingMember) return;
    const nombre = memberForm.nombre.trim();
    const apellido = memberForm.apellido.trim();
    const email = memberForm.email.trim().toLowerCase();
    const telefono = memberForm.telefono.trim().replace(/[\s().-]/g, '');
    const namePattern = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' -]{2,}$/;
    if (!namePattern.test(nombre)) return Alert.alert('Nombre no válido', 'Usa al menos dos letras; también se permiten espacios, apóstrofes y guiones.');
    if (!namePattern.test(apellido)) return Alert.alert('Apellido no válido', 'Usa al menos dos letras; también se permiten espacios, apóstrofes y guiones.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Alert.alert('Correo no válido', 'Escribe un correo electrónico válido.');
    if (!/^\+?\d{7,15}$/.test(telefono)) return Alert.alert('Teléfono no válido', 'Incluye el prefijo del país y entre 7 y 15 dígitos.');
    const duplicate = members.find((entry) => entry.id !== editingMember.id && (
      entry.email?.trim().toLowerCase() === email || String(entry.telefono ?? '').replace(/\D/g, '') === telefono.replace(/\D/g, '')
    ));
    if (duplicate) return Alert.alert('Registro duplicado', 'Ya existe otra usuaria con ese correo o teléfono.');
    const birthDate = new Date(`${memberForm.fecha_nacimiento}T00:00:00`);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const minimumAdultDate = new Date(now.getFullYear() - 18, now.getMonth(), now.getDate());
    const normalizedBirthDate = Number.isNaN(birthDate.getTime()) ? '' : `${birthDate.getFullYear()}-${String(birthDate.getMonth() + 1).padStart(2, '0')}-${String(birthDate.getDate()).padStart(2, '0')}`;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(memberForm.fecha_nacimiento) || !normalizedBirthDate || normalizedBirthDate !== memberForm.fecha_nacimiento || birthDate >= today) {
      return Alert.alert('Fecha de nacimiento no válida', 'Escribe la fecha como AAAA-MM-DD y asegúrate de que sea anterior a hoy.');
    }
    if (birthDate > minimumAdultDate) return Alert.alert('Edad no válida', 'La usuaria debe tener al menos 18 años.');
    if (!memberForm.pais_residencia || !memberForm.pais_nacimiento || !memberForm.comunidad || !memberForm.cristiana || !memberForm.estatus_matrimonial) {
      return Alert.alert('Faltan datos', 'Completa país de residencia y nacimiento, comunidad, respuesta de fe y estatus matrimonial.');
    }
    setSavingMember(true);
    try {
      const payload = {
        nombre, apellido, email, telefono,
        pais_residencia: memberForm.pais_residencia,
        comunidad: memberForm.comunidad,
        cristiana: memberForm.cristiana,
        fecha_nacimiento: memberForm.fecha_nacimiento,
        pais_nacimiento: memberForm.pais_nacimiento,
        estatus_matrimonial: memberForm.estatus_matrimonial,
        hijos: Math.max(0, Number.parseInt(String(memberForm.hijos), 10) || 0),
        comments: memberForm.comments.trim(),
      };
      const { data, error } = await supabase.from('unirse').update(payload).eq('id', editingMember.id).select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('No se actualizó el registro. Verifica que tu cuenta sea Super Admin.');
      setEditingMember(null);
      await load();
      Alert.alert('Registro actualizado', 'Los cambios se guardaron correctamente.');
    } catch (error) { Alert.alert('No se pudo guardar', error instanceof Error ? error.message : 'Inténtalo de nuevo.'); }
    finally { setSavingMember(false); }
  };

  const deleteMember = (member: Member) => Alert.alert('Eliminar registro', `¿Eliminar definitivamente el registro de ${member.nombre} ${member.apellido}? Esta acción no se puede deshacer.`, [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Eliminar', style: 'destructive', onPress: async () => {
      try {
        const { data, error } = await supabase.from('unirse').delete().eq('id', member.id).select('id');
        if (error) throw error;
        if (!data?.length) throw new Error('No se eliminó el registro. Verifica tus permisos.');
        setEditingMember(null); await load();
      } catch (error) { Alert.alert('No se pudo eliminar', error instanceof Error ? error.message : 'Inténtalo de nuevo.'); }
    } },
  ]);

  const shareCsv = async () => {
    if (!canExport || exporting) return;
    setExporting('csv');
    try {
      const headers = ['Nombre', 'Apellido', 'Email', 'Teléfono', 'País residencia', 'Comunidad', 'Cristiana', 'Fecha nacimiento', 'País nacimiento', 'Estatus matrimonial', 'Hijos', 'Comentarios', 'Fecha registro'];
      const rows = filtered.map((member) => [member.nombre, member.apellido, member.email, member.telefono, member.pais_residencia, member.comunidad, member.cristiana, member.fecha_nacimiento, member.pais_nacimiento, member.estatus_matrimonial, member.hijos, member.comments, memberDate(member.created_at)]);
      const content = `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')}`;
      const file = new File(Paths.cache, `mujeres-con-proposito-${Date.now()}.csv`);
      file.create(); await file.write(content);
      await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: 'Compartir registros CSV' });
    } catch (error) { Alert.alert('No se pudo exportar el CSV', error instanceof Error ? error.message : 'Inténtalo de nuevo.'); }
    finally { setExporting(null); }
  };

  const sharePdf = async () => {
    if (!canExport || exporting) return;
    setExporting('pdf');
    try {
      const now = new Date();
      const exportedAt = new Intl.DateTimeFormat('es-ES', { dateStyle: 'long', timeStyle: 'short' }).format(now);
      const label = (options: WheelOption[], value: string) => options.find((o) => o.value === value)?.label ?? value;
      const activeFilters = [
        query.trim() ? `Búsqueda: «${query.trim()}»` : '',
        countryFilter ? `País: ${countryFilter}` : '',
        communityFilter ? `Comunidad: ${communityFilter}` : '',
        faithFilter ? `Fe: ${label(faithFilterOptions, faithFilter)}` : '',
        `Orden: ${label(sortOptions, sortMode)}`,
      ].filter(Boolean);
      const shownCountries = new Set(filtered.map((m) => m.pais_residencia).filter(Boolean)).size;
      const shownCommunities = new Set(filtered.map((m) => m.comunidad).filter(Boolean)).size;
      const cell = (value: unknown) => escapeHtml(String(value ?? '').trim() || '—');
      const rows = filtered.map((m, i) => `<tr>
        <td class="n">${i + 1}</td>
        <td><strong>${cell(`${m.nombre} ${m.apellido}`)}</strong>${m.comments ? `<div class="note">${cell(m.comments)}</div>` : ''}</td>
        <td>${cell(m.email)}<div class="sub">${cell(m.telefono)}</div></td>
        <td>${cell(m.pais_residencia)}<div class="sub">Nac.: ${cell(m.pais_nacimiento)}</div></td>
        <td>${cell(m.comunidad)}</td>
        <td>${cell(m.cristiana)}</td>
        <td>${cell(memberDate(m.fecha_nacimiento))}</td>
        <td>${cell(m.estatus_matrimonial)}<div class="sub">Hijos: ${cell(m.hijos)}</div></td>
        <td>${cell(memberDate(m.created_at))}</td>
      </tr>`).join('');
      const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><style>
        @page { size: A4 landscape; margin: 14mm 12mm; }
        * { box-sizing: border-box; }
        body { margin: 0; font-family: -apple-system, "SF Pro Text", "Helvetica Neue", Roboto, Arial, sans-serif; color: #3f2623; font-size: 9px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .head { display: flex; justify-content: space-between; align-items: flex-end; padding-bottom: 12px; border-bottom: 2px solid #a64b43; }
        .brand { display: flex; align-items: center; gap: 10px; }
        .logo { width: 34px; height: 34px; border-radius: 9px; background: #f9e1dc; display: flex; align-items: center; justify-content: center; }
        .kicker { font-size: 8px; font-weight: 700; letter-spacing: 1.4px; text-transform: uppercase; color: #a64b43; }
        h1 { margin: 2px 0 0; font-family: Georgia, "New York", serif; font-weight: 400; font-size: 22px; letter-spacing: -0.3px; }
        .date { text-align: right; color: #6d5250; font-size: 9px; line-height: 1.5; }
        .summary { display: flex; gap: 8px; margin: 12px 0 8px; }
        .stat { flex: 1; background: #faf5f4; border-radius: 8px; padding: 8px 10px; }
        .stat b { display: block; font-size: 16px; color: #3f2623; }
        .stat span { color: #6d5250; font-size: 8px; text-transform: uppercase; letter-spacing: .6px; }
        .filters { margin: 0 0 10px; color: #6d5250; font-size: 8.5px; }
        .chip { display: inline-block; margin: 0 4px 4px 0; padding: 3px 8px; border-radius: 999px; background: #f3e9e6; color: #6d3a33; font-weight: 600; }
        table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        thead { display: table-header-group; }
        th { text-align: left; font-size: 7.5px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; color: #fff; background: #a64b43; padding: 7px 6px; }
        th:first-child { border-top-left-radius: 6px; } th:last-child { border-top-right-radius: 6px; }
        td { padding: 6px; border-bottom: 1px solid #efe3df; vertical-align: top; overflow-wrap: anywhere; line-height: 1.35; }
        tr { page-break-inside: avoid; }
        tbody tr:nth-child(even) td { background: #fcf8f7; }
        .n { color: #b09a96; }
        .sub { color: #8a706c; font-size: 8px; margin-top: 2px; }
        .note { color: #6d5250; font-style: italic; font-size: 8px; margin-top: 3px; }
        .empty { margin-top: 30px; padding: 24px; text-align: center; border: 1px dashed #e0cfca; border-radius: 10px; color: #6d5250; font-size: 11px; }
        footer { margin-top: 14px; padding-top: 8px; border-top: 1px solid #efe3df; display: flex; justify-content: space-between; color: #8a706c; font-size: 8px; }
      </style></head><body>
        <div class="head">
          <div class="brand">
            <div class="logo"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a64b43" stroke-width="1.6" stroke-linecap="round"><path d="M12 22c0-5 .5-8 1-10"/><path d="M13 12c-3-4-7-5-8-3s4 4 8 3z"/><path d="M13 12c1-5 4-8 6-6s-2 6-6 6z"/><path d="M13 12c4 0 7 2 6 4s-5 0-6-4z"/></svg></div>
            <div><div class="kicker">Mujeres con Propósito · Panel de comunidad</div><h1>Registros de la comunidad</h1></div>
          </div>
          <div class="date">Exportado el ${escapeHtml(exportedAt)}<br>${escapeHtml(access?.nombre || access?.email || '')}</div>
        </div>
        <div class="summary">
          <div class="stat"><b>${filtered.length}</b><span>${filtered.length === 1 ? 'Registro' : 'Registros'}</span></div>
          <div class="stat"><b>${members.length}</b><span>Total en la base</span></div>
          <div class="stat"><b>${shownCountries}</b><span>Países</span></div>
          <div class="stat"><b>${shownCommunities}</b><span>Comunidades</span></div>
        </div>
        <div class="filters">${activeFilters.map((f) => `<span class="chip">${escapeHtml(f)}</span>`).join('')}</div>
        ${filtered.length ? `<table><colgroup><col style="width:3%"><col style="width:18%"><col style="width:20%"><col style="width:13%"><col style="width:11%"><col style="width:7%"><col style="width:8%"><col style="width:10%"><col style="width:10%"></colgroup>
          <thead><tr><th>#</th><th>Nombre</th><th>Contacto</th><th>País</th><th>Comunidad</th><th>Cristiana</th><th>Nacimiento</th><th>Familia</th><th>Registro</th></tr></thead>
          <tbody>${rows}</tbody></table>` : '<div class="empty">No hay registros que coincidan con los filtros seleccionados.</div>'}
        <footer><span>Documento confidencial · Uso interno de Mujeres con Propósito 930 a.s.b.l.</span><span>mcp930.org</span></footer>
      </body></html>`;
      // iOS ignores CSS @page margins; pass them explicitly (points). A4 landscape = 842 × 595 pt.
      const { uri } = await Print.printToFileAsync({ html, width: 842, height: 595, margins: { top: 40, right: 34, bottom: 40, left: 34 } });
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Compartir registros en PDF' });
    } catch (error) { Alert.alert('No se pudo generar el PDF', error instanceof Error ? error.message : 'Inténtalo de nuevo.'); }
    finally { setExporting(null); }
  };

  const openExport = () => {
    if (exporting) return;
    const summary = `${filtered.length} ${filtered.length === 1 ? 'registro' : 'registros'} con los filtros actuales`;
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { title: 'Exportar', message: summary, options: ['PDF para imprimir', 'CSV para Excel', 'Cancelar'], cancelButtonIndex: 2 },
        (index) => { if (index === 0) void sharePdf(); if (index === 1) void shareCsv(); },
      );
    } else {
      Alert.alert('Exportar', summary, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'CSV', onPress: () => void shareCsv() },
        { text: 'PDF', onPress: () => void sharePdf() },
      ]);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Dashboard', headerRight: () => canExport ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Exportar registros" disabled={!!exporting} onPress={openExport} hitSlop={10} style={({ pressed }) => [s.exportButton, pressed && { opacity: 0.6 }]}>
          {exporting ? <ActivityIndicator size="small" color={C.wine} /> : <Ionicons name="share-outline" size={19} color={C.wine} />}
          <Text style={s.exportText}>{exporting ? 'Preparando…' : 'Exportar'}</Text>
        </Pressable>
      ) : undefined }} />
      <ScrollView contentContainerStyle={s.page} refreshControl={<RefreshControl refreshing={loading && members.length > 0} onRefresh={() => void load()} tintColor={C.wine} />}>
        <View style={s.heading}>
          <Text style={s.kicker}>PANEL DE COMUNIDAD</Text>
          <Text style={s.title}>Registros</Text>
          <Text style={s.subtitle}>Resumen y seguimiento de las mujeres de la comunidad.</Text>
        </View>
        <View style={s.stats}>
          <Stat icon="people" label="Registros" value={members.length} tint={C.blush} />
          <Stat icon="globe-outline" label="Países" value={countries} tint="#f4ead8" />
          <Stat icon="heart-outline" label="Comunidades" value={communities} tint="#eee5f1" />
          <Stat icon="calendar-outline" label="Este mes" value={monthly} tint="#e5f0ea" />
        </View>
        <Group header="Personas por comunidad" footer="Distribución de los registros actuales.">
          {communityCounts.map(([community, count]) => <Row key={community} label={community} value={String(count)} chevron={false} />)}
        </Group>
        {canReadPrivate ? <Group header="Próximos cumpleaños" footer="Cumpleaños en los próximos 30 días.">
          {birthdays.length ? birthdays.map(({ member, days }) => (
            <Row key={`${member.id}-birthday`} icon="gift-outline" tint={C.gold2} label={`${member.nombre} ${member.apellido}`} sub={`${fmtDate(member.fecha_nacimiento)} · ${days === 0 ? 'Hoy' : `en ${days} días`}${days === 0 ? ` · ${member.ultimo_correo_cumpleanos && new Date(member.ultimo_correo_cumpleanos).toDateString() === now.toDateString() ? 'Correo enviado' : 'Correo pendiente'}` : ''}`} chevron={false} />
          )) : <Row icon="calendar-clear-outline" label="Sin cumpleaños próximos" chevron={false} />}
        </Group> : null}
        <View style={s.listHeader}>
          <View><Text style={s.listTitle}>Lista de usuarias</Text><Text style={s.listSub}>{filtered.length} registros</Text></View>
          <Pressable accessibilityLabel="Actualizar" onPress={() => void load()} style={s.refresh}><Ionicons name="refresh" size={19} color={C.wine} /></Pressable>
        </View>
        <View style={s.search}>
          <Ionicons name="search" size={18} color={C.muted} />
          <TextInput value={query} onChangeText={(value) => { setQuery(value); setPage(0); }} placeholder={canReadPrivate ? 'Buscar nombre, correo o país' : 'Buscar nombre, comunidad o país'} placeholderTextColor="#a28f8c" style={s.searchInput} autoCapitalize="none" />
        </View>
        <Group header="Filtros y orden">
          <FieldRow label="País de residencia"><WheelPicker title="Filtrar por país" value={countryFilter} options={countryFilterOptions} onChange={(value) => { setCountryFilter(value); setPage(0); }} /></FieldRow>
          <FieldRow label="Comunidad"><WheelPicker title="Filtrar por comunidad" value={communityFilter} options={communityFilterOptions} onChange={(value) => { setCommunityFilter(value); setPage(0); }} /></FieldRow>
          <FieldRow label="Respuesta de fe"><WheelPicker title="Filtrar por respuesta" value={faithFilter} options={faithFilterOptions} onChange={(value) => { setFaithFilter(value); setPage(0); }} /></FieldRow>
          <FieldRow label="Ordenar"><WheelPicker title="Ordenar registros" value={sortMode} options={sortOptions} onChange={(value) => { setSortMode(value); setPage(0); }} /></FieldRow>
          <FieldRow label="Tamaño de página"><WheelPicker title="Registros por página" value={pageSize} options={sizeOptions} onChange={(value) => { setPageSize(value); setPage(0); }} /></FieldRow>
          {(countryFilter || communityFilter || faithFilter) ? <Row icon="close-circle-outline" label="Limpiar filtros" onPress={() => { setCountryFilter(''); setCommunityFilter(''); setFaithFilter(''); setPage(0); }} /> : null}
        </Group>
        {loading && !members.length ? <ActivityIndicator color={C.wine} style={{ marginTop: 28 }} /> : (
          <Group>
            {visible.length ? visible.map((member) => (
              <Row key={member.id} icon="person" label={`${member.nombre || 'Sin nombre'} ${member.apellido || ''}`.trim()} sub={[member.comunidad, member.pais_residencia, member.email].filter(Boolean).join(' · ')} value={fmtDate(member.created_at)} onPress={() => openMember(member)} />
            )) : <Row icon="search" label="No hay resultados" sub="Prueba con otro término." chevron={false} />}
          </Group>
        )}
        {filtered.length > size ? (
          <View style={s.pagination}>
            <Pressable disabled={page === 0} onPress={() => setPage((p) => Math.max(0, p - 1))} style={[s.pageButton, page === 0 && s.disabled]}><Ionicons name="chevron-back" size={18} color={C.wine} /></Pressable>
            <Text style={s.pageText}>{page + 1} / {Math.ceil(filtered.length / size)}</Text>
            <Pressable disabled={(page + 1) * size >= filtered.length} onPress={() => setPage((p) => p + 1)} style={[s.pageButton, (page + 1) * size >= filtered.length && s.disabled]}><Ionicons name="chevron-forward" size={18} color={C.wine} /></Pressable>
          </View>
        ) : null}
        {!canExport ? <Text style={s.permissionNote}>La exportación está disponible para Manager y Super Admin.</Text> : null}
      </ScrollView>
      <Modal visible={!!editingMember} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeMemberEditor}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: C.bg }}>
          <View style={s.modalBar}>
            <Pressable disabled={savingMember} onPress={closeMemberEditor}><Text style={s.modalAction}>Cancelar</Text></Pressable>
            <Text style={s.modalTitle}>Editar registro</Text>
            <Pressable disabled={savingMember} onPress={() => void saveMember()}><Text style={[s.modalAction, s.modalActionStrong]}>{savingMember ? 'Guardando…' : 'Guardar'}</Text></Pressable>
          </View>
          <ScrollView contentContainerStyle={s.formPage} keyboardShouldPersistTaps="handled">
            {editingMember ? <Text style={s.formLead}>Actualiza los datos de {editingMember.nombre} {editingMember.apellido}.</Text> : null}
            <Group header="Datos personales">
              <InputRow label="Nombre" value={memberForm.nombre} onChangeText={(value) => updateForm('nombre', value)} autoCapitalize="words" autoComplete="given-name" />
              <InputRow label="Apellido" value={memberForm.apellido} onChangeText={(value) => updateForm('apellido', value)} autoCapitalize="words" autoComplete="family-name" />
              <InputRow label="Correo electrónico" value={memberForm.email} onChangeText={(value) => updateForm('email', value)} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
              <InputRow label="Teléfono internacional" value={memberForm.telefono} onChangeText={(value) => updateForm('telefono', value)} placeholder="+352…" keyboardType="phone-pad" />
            </Group>
            <Group header="Contacto rápido">
              <Row icon="mail-outline" label="Enviar correo" sub={memberForm.email} onPress={() => { void Linking.openURL(`mailto:${memberForm.email}`); }} />
              <Row icon="call-outline" label="Llamar" sub={memberForm.telefono} onPress={() => { void Linking.openURL(`tel:${memberForm.telefono.replace(/[^+\d]/g, '')}`); }} />
              <Row icon="chatbubble-ellipses-outline" label="Abrir WhatsApp" onPress={() => { void Linking.openURL(`https://wa.me/${memberForm.telefono.replace(/\D/g, '')}`); }} />
            </Group>
            <Group header="Comunidad">
              <FieldRow label="País de residencia"><WheelPicker title="País de residencia" value={memberForm.pais_residencia} options={countryPickerOptions} onChange={(value) => updateForm('pais_residencia', value)} /></FieldRow>
              <FieldRow label="País de nacimiento"><WheelPicker title="País de nacimiento" value={memberForm.pais_nacimiento} options={birthCountryPickerOptions} onChange={(value) => updateForm('pais_nacimiento', value)} /></FieldRow>
              <FieldRow label="Comunidad"><WheelPicker title="Comunidad" value={memberForm.comunidad} options={communityPickerOptions} onChange={(value) => updateForm('comunidad', value)} /></FieldRow>
              <FieldRow label="¿Eres cristiana?"><WheelPicker title="¿Eres cristiana?" value={memberForm.cristiana} options={faithPickerOptions} onChange={(value) => updateForm('cristiana', value)} /></FieldRow>
              <FieldRow label="Estatus matrimonial"><WheelPicker title="Estatus matrimonial" value={memberForm.estatus_matrimonial} options={maritalPickerOptions} onChange={(value) => updateForm('estatus_matrimonial', value)} /></FieldRow>
              <FieldRow label="Fecha de nacimiento">
                <Pressable accessibilityRole="button" accessibilityLabel="Elegir fecha de nacimiento" onPress={() => setShowBirthDatePicker(true)} style={s.dateSelector}>
                  <Text style={[s.dateSelectorText, !memberForm.fecha_nacimiento && { color: '#a28f8c' }]}>{memberForm.fecha_nacimiento ? fmtDate(memberForm.fecha_nacimiento) : 'Selecciona una fecha'}</Text>
                  <Ionicons name="calendar-outline" size={18} color={C.wine} />
                </Pressable>
                {showBirthDatePicker && Platform.OS === 'ios' ? (
                  <View style={s.datePickerCard}>
                    <DateTimePicker value={birthPickerDate} mode="date" display="spinner" maximumDate={latestAdultBirthDate} minimumDate={new Date(1900, 0, 1)} onChange={handleBirthDateChange} />
                    <Pressable onPress={() => setShowBirthDatePicker(false)} style={s.datePickerDone}><Text style={s.datePickerDoneText}>Listo</Text></Pressable>
                  </View>
                ) : null}
                {showBirthDatePicker && Platform.OS === 'android' ? <DateTimePicker value={birthPickerDate} mode="date" display="default" maximumDate={latestAdultBirthDate} minimumDate={new Date(1900, 0, 1)} onChange={handleBirthDateChange} /> : null}
              </FieldRow>
              <InputRow label="Hijos" value={String(memberForm.hijos ?? 0)} onChangeText={(value) => updateForm('hijos', Math.max(0, Number.parseInt(value.replace(/\D/g, ''), 10) || 0))} keyboardType="number-pad" />
              <FieldRow label="Comentarios"><TextInput multiline value={memberForm.comments} onChangeText={(value) => updateForm('comments', value)} placeholder="Información adicional" placeholderTextColor="#a28f8c" style={s.commentsInput} /></FieldRow>
            </Group>
            <Group footer="Al guardar, el registro se actualiza en la web y en la app.">
              <Pressable disabled={savingMember} onPress={() => void saveMember()} style={[s.saveButton, savingMember && { opacity: 0.65 }]}><Text style={s.saveButtonText}>{savingMember ? 'Guardando…' : 'Guardar cambios'}</Text></Pressable>
              <Row icon="trash-outline" tint={C.live} label="Eliminar registro" destructive onPress={() => editingMember && deleteMember(editingMember)} />
            </Group>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', backgroundColor: C.bg },
  page: { padding: 18, paddingBottom: 60 },
  heading: { paddingTop: 8, paddingBottom: 20 },
  kicker: { fontFamily: sans, fontSize: 11, fontWeight: '700', letterSpacing: 1.5, color: C.wine },
  title: { fontFamily: sans, fontSize: 32, lineHeight: 38, letterSpacing: -1, fontWeight: '700', color: C.ink, marginTop: 5 },
  subtitle: { fontFamily: sans, fontSize: 14, lineHeight: 20, color: C.muted, marginTop: 4 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 },
  stat: { width: '48%', flexGrow: 1, minWidth: 142, backgroundColor: C.card, borderRadius: 18, padding: 14, boxShadow: '0 3px 12px rgba(63,38,35,0.05)' },
  statIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  statValue: { fontFamily: sans, fontSize: 25, lineHeight: 30, fontWeight: '700', color: C.ink },
  statLabel: { fontFamily: sans, fontSize: 12, color: C.muted, marginTop: 2 },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 26, marginBottom: 12 },
  listTitle: { fontFamily: sans, fontSize: 21, fontWeight: '700', color: C.ink, letterSpacing: -0.4 },
  listSub: { fontFamily: sans, fontSize: 13, color: C.muted, marginTop: 3 },
  refresh: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: C.blush },
  search: { minHeight: 48, borderRadius: 15, backgroundColor: C.card, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 14, borderWidth: 1, borderColor: C.line },
  searchInput: { flex: 1, fontFamily: sans, color: C.ink, fontSize: 15, paddingVertical: 10 },
  pagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18, paddingVertical: 20 },
  pageButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: C.blush },
  disabled: { opacity: 0.35 },
  pageText: { fontFamily: sans, color: C.muted, fontSize: 14, fontWeight: '600' },
  permissionNote: { fontFamily: sans, color: C.muted, textAlign: 'center', marginTop: 12, fontSize: 12 },
  exportButton: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 6 },
  exportText: { fontFamily: sans, fontSize: 16, fontWeight: '600', color: C.wine },
  dateSelector: { minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dateSelectorText: { fontFamily: sans, fontSize: 15, color: C.ink },
  datePickerCard: { marginTop: 10, padding: 8, borderRadius: 18, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, overflow: 'hidden' },
  datePickerDone: { alignSelf: 'flex-end', paddingHorizontal: 14, paddingVertical: 9 },
  datePickerDoneText: { fontFamily: sans, fontWeight: '700', color: C.wine, fontSize: 15 },
  modalBar: { height: 58, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.line, backgroundColor: C.bg },
  modalAction: { fontFamily: sans, fontSize: 15, color: C.wine },
  modalActionStrong: { fontWeight: '700' },
  modalTitle: { fontFamily: sans, fontSize: 16, fontWeight: '600', color: C.ink },
  formPage: { padding: 18, paddingBottom: 54 },
  formLead: { fontFamily: sans, color: C.muted, fontSize: 14, lineHeight: 20, marginTop: 6 },
  commentsInput: { minHeight: 96, textAlignVertical: 'top', fontFamily: sans, fontSize: 16, color: C.ink, paddingVertical: 8 },
  saveButton: { minHeight: 50, borderRadius: 15, backgroundColor: C.wine, alignItems: 'center', justifyContent: 'center', margin: 12 },
  saveButtonText: { fontFamily: sans, fontSize: 16, fontWeight: '700', color: '#fff' },
});
