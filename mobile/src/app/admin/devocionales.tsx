import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { AdminLogin } from '@/components/admin-login';
import { AdminGestureRow } from '@/components/admin-gesture-row';
import { Group, InputRow, Row } from '@/components/form';
import { C, sans } from '@/constants/theme';
import { canAdmin, uploadImage } from '@/lib/admin';
import { supabase } from '@/lib/supabase';
import { useAdmin } from '@/lib/use-admin';
import { SheetModal } from '@/components/sheet-modal';
import { usePullToRefresh } from '@/components/pull-refresh';

type Article = { id: number; slug: string; titulo: string; resumen: string; contenido: string; introduccion_html?: string; contenido_html?: string; versiculo: string; categorias: string[]; autora: string; imagen_url: string; estado: string; publicado: boolean; fecha_publicacion: string | null; created_by: string; updated_at?: string; reviewer_id?: string | null; pending_content?: Record<string, unknown> | null; pending_fecha_publicacion?: string | null; cover_alt?: string | null; oracion_html?: string | null };
type HistoryEntry = { id: number; accion: string; nota?: string | null; actor_email?: string | null; created_at: string };
const DEVOTIONAL_CATEGORIES = ['Fe', 'Esperanza', 'Amor', 'Oración', 'Gracia', 'Sabiduría', 'Salvación'];

function toEditorText(value: string) {
  return String(value || '').replace(/<br\s*\/?\s*>/gi, '\n').replace(/<li[^>]*>/gi, '• ').replace(/<blockquote[^>]*>/gi, '> ').replace(/<h[1-6][^>]*>/gi, '## ').replace(/<\/(p|div|li|blockquote|h[1-6])>/gi, '\n\n')
    .replace(/<(strong|b)>/gi, '**').replace(/<\/(strong|b)>/gi, '**')
    .replace(/<(em|i)>/gi, '*').replace(/<\/(em|i)>/gi, '*')
    .replace(/<u>/gi, '__').replace(/<\/u>/gi, '__')
    .replace(/<(del|s|strike)>/gi, '~~').replace(/<\/(del|s|strike)>/gi, '~~')
    .replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim();
}

function editorHtml(value: string) {
  const inline = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>').replace(/__(.+?)__/g, '<u>$1</u>').replace(/~~(.+?)~~/g, '<del>$1</del>');
  return value.split(/\n{2,}/).map((block) => {
    const lines = block.split('\n');
    if (lines.every((line) => /^\s*•\s*/.test(line))) return `<ul>${lines.map((line) => `<li>${inline(line.replace(/^\s*•\s*/, ''))}</li>`).join('')}</ul>`;
    if (lines.every((line) => /^\s*\d+[.)]\s*/.test(line))) return `<ol>${lines.map((line) => `<li>${inline(line.replace(/^\s*\d+[.)]\s*/, ''))}</li>`).join('')}</ol>`;
    if (lines.every((line) => /^\s*>\s?/.test(line))) return `<blockquote><p style="text-align:justify">${lines.map((line) => inline(line.replace(/^\s*>\s?/, ''))).join('<br>')}</p></blockquote>`;
    if (lines.length === 1 && /^\s*##\s+/.test(lines[0])) return `<h2>${inline(lines[0].replace(/^\s*##\s+/, ''))}</h2>`;
    return `<p style="text-align:justify">${lines.map(inline).join('<br>')}</p>`;
  }).join('');
}

function formattedText(value: string, style: object): ReactNode {
  const tokens = value.split(/(\*\*.+?\*\*|\*.+?\*|__.+?__|~~.+?~~)/g);
  return <Text style={style}>{tokens.map((token, index) => {
    if (token.startsWith('**') && token.endsWith('**')) return <Text key={index} style={{ fontWeight: '800' }}>{token.slice(2, -2)}</Text>;
    if (token.startsWith('__') && token.endsWith('__')) return <Text key={index} style={{ textDecorationLine: 'underline' }}>{token.slice(2, -2)}</Text>;
    if (token.startsWith('~~') && token.endsWith('~~')) return <Text key={index} style={{ textDecorationLine: 'line-through' }}>{token.slice(2, -2)}</Text>;
    if (token.startsWith('*') && token.endsWith('*')) return <Text key={index} style={{ fontStyle: 'italic' }}>{token.slice(1, -1)}</Text>;
    return token;
  })}</Text>;
}

function formattedPreview(value: string, bodyStyle: object = s.previewBody) {
  return value.split(/\n{2,}/).filter(Boolean).map((block, index) => {
    const lines = block.split('\n');
    if (lines.length === 1 && /^\s*##\s+/.test(lines[0])) return <View key={index} style={s.previewBlock}>{formattedText(lines[0].replace(/^\s*##\s+/, ''), s.previewSubheading)}</View>;
    if (lines.every((line) => /^\s*>\s?/.test(line))) return <View key={index} style={s.previewQuote}>{formattedText(lines.map((line) => line.replace(/^\s*>\s?/, '')).join('\n'), s.previewQuoteText)}</View>;
    if (lines.every((line) => /^\s*•\s*/.test(line) || !line.trim())) return <View key={index} style={s.previewBlock}>{lines.filter(Boolean).map((line, i) => <View key={i} style={s.previewListRow}><Text style={s.previewBullet}>•</Text>{formattedText(line.replace(/^\s*•\s*/, ''), bodyStyle)}</View>)}</View>;
    if (lines.every((line) => /^\s*\d+[.)]\s*/.test(line) || !line.trim())) return <View key={index} style={s.previewBlock}>{lines.filter(Boolean).map((line, i) => <View key={i} style={s.previewListRow}><Text style={s.previewBullet}>{`${i + 1}.`}</Text>{formattedText(line.replace(/^\s*\d+[.)]\s*/, ''), bodyStyle)}</View>)}</View>;
    return <View key={index} style={s.previewBlock}>{formattedText(block, bodyStyle)}</View>;
  });
}

function dateTimeLabel(value: Date) { return new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' }).format(value); }

export default function AdminDevocionales() {
  const { access, ready } = useAdmin();
  const [articles, setArticles] = useState<Article[]>([]);
  const [articleFilter, setArticleFilter] = useState<'all' | 'published' | 'draft'>('all');
  const [articleQuery, setArticleQuery] = useState('');
  const [userId, setUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Article | null>(null);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [content, setContent] = useState('');
  const [verse, setVerse] = useState('');
  const [image, setImage] = useState('');
  const [coverAlt, setCoverAlt] = useState('');
  const [prayer, setPrayer] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [publishAt, setPublishAt] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [preview, setPreview] = useState(false);
  const [historyArticle, setHistoryArticle] = useState<Article | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [changeRequest, setChangeRequest] = useState<Article | null>(null);
  const [changeNote, setChangeNote] = useState('');
  const [approvalArticle, setApprovalArticle] = useState<Article | null>(null);
  const [approvalDate, setApprovalDate] = useState(new Date());
  const [previewArticle, setPreviewArticle] = useState<Article | null>(null);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [busy, setBusy] = useState(false);
  const contentInputRef = useRef<ComponentRef<typeof TextInput>>(null);
  const author = String(editing?.autora ?? access?.nombre ?? 'Equipo Mujeres con Propósito');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: identity } = await supabase.auth.getUser();
      const id = identity.user?.id ?? '';
      setUserId(id);
      const base = () => supabase.from('devocionales').select('*').order('updated_at', { ascending: false });
      if (access?.isSuperAdmin || canAdmin(access,'devotionals','publish')) {
        const { data, error } = await base();
        if (error) throw error;
        setArticles((data ?? []) as Article[]);
      } else {
        const requests = [];
        if (canAdmin(access,'devotionals','create')) requests.push(base().eq('created_by', id));
        if (canAdmin(access,'devotionals','publish')) requests.push(base().in('estado', ['pendiente_revision', 'en_revision']).neq('created_by', id));
        if (!requests.length && canAdmin(access,'devotionals','view')) requests.push(base().eq('publicado', true));
        const results = await Promise.all(requests);
        const failed = results.find((result) => result.error);
        if (failed?.error) throw failed.error;
        const combined = new Map<number, Article>();
        for (const result of results) for (const article of (result.data ?? []) as Article[]) combined.set(article.id, article);
        setArticles([...combined.values()].sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || '')));
      }
    } catch (error) { Alert.alert('No se pudieron cargar los devocionales', error instanceof Error ? error.message : ''); }
    finally { setLoading(false); }
  }, [access]);

  const pull = usePullToRefresh(load);
  useFocusEffect(useCallback(() => {
    if (access && !access.isRevoked && (access.isSuperAdmin || canAdmin(access,'devotionals','view'))) void load();
  }, [access, load]));

  const open = (article?: Article) => {
    const pending = article?.pending_content;
    setEditing(article ?? null);
    setTitle(String(pending?.titulo ?? article?.titulo ?? ''));
    setSummary(toEditorText(String(pending?.introduccion_html ?? pending?.resumen ?? article?.introduccion_html ?? article?.resumen ?? '')));
    setContent(toEditorText(String(pending?.contenido_html ?? pending?.contenido ?? article?.contenido_html ?? article?.contenido ?? '')));
    setVerse(String(pending?.versiculo ?? article?.versiculo ?? ''));
    setImage(String(pending?.imagen_url ?? article?.imagen_url ?? ''));
    setCoverAlt(String(pending?.cover_alt ?? article?.cover_alt ?? ''));
    setPrayer(toEditorText(String(pending?.oracion_html ?? article?.oracion_html ?? '')));
    const pendingCategories = pending?.categorias;
    setCategories(Array.isArray(pendingCategories) ? pendingCategories.map(String) : article?.categorias ?? []);
    setPreview(false);
    const scheduled = article?.pending_fecha_publicacion || article?.fecha_publicacion;
    const parsedDate = scheduled ? new Date(scheduled) : new Date();
    setPublishAt(Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate);
    setSelection({ start: 0, end: 0 });
    setModal(true);
  };

  const chooseCover = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return Alert.alert('Permite el acceso a Fotos', 'Necesitamos acceso para elegir la portada.');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [16, 9], quality: 1 });
    if (result.canceled) return;
    const asset = result.assets[0];
    setBusy(true);
    try { setImage(await uploadImage(asset.uri, asset, 'devocionales')); }
    catch (error) { Alert.alert('No se pudo subir la portada', error instanceof Error ? error.message : ''); }
    finally { setBusy(false); }
  };

  const applyMarkup = (before: string, after = before) => {
    const from = Math.min(selection.start, content.length);
    const to = Math.min(selection.end, content.length);
    const chosen = content.slice(from, to) || 'texto';
    const next = `${content.slice(0, from)}${before}${chosen}${after}${content.slice(to)}`;
    setContent(next);
    const nextSelection = { start: from + before.length, end: from + before.length + chosen.length };
    setSelection(nextSelection);
    requestAnimationFrame(() => {
      contentInputRef.current?.focus();
      contentInputRef.current?.setNativeProps({ selection: nextSelection });
    });
  };

  const applyBlock = (prefix: string, numbered = false) => {
    const from = Math.min(selection.start, content.length);
    const to = Math.min(selection.end, content.length);
    const chosen = content.slice(from, to) || 'Escribe aquí';
    const lines = chosen.split('\n');
    const block = lines.map((line, index) => `${numbered ? `${index + 1}. ` : prefix}${line}`).join('\n');
    const next = `${content.slice(0, from)}${block}${content.slice(to)}`;
    setContent(next);
    const nextSelection = { start: from, end: from + block.length };
    setSelection(nextSelection);
    requestAnimationFrame(() => {
      contentInputRef.current?.focus();
      contentInputRef.current?.setNativeProps({ selection: nextSelection });
    });
  };

  const onPublishDateChange = (event: DateTimePickerEvent, date?: Date) => {
    if (date) setPublishAt((current) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), current.getHours(), current.getMinutes()));
    if (event.type === 'dismissed' || Platform.OS !== 'ios') setShowDatePicker(false);
  };

  const onPublishTimeChange = (event: DateTimePickerEvent, date?: Date) => {
    if (date) setPublishAt((current) => new Date(current.getFullYear(), current.getMonth(), current.getDate(), date.getHours(), date.getMinutes()));
    if (event.type === 'dismissed' || Platform.OS !== 'ios') setShowTimePicker(false);
  };

  const save = async (mode: 'draft' | 'submit' | 'publish') => {
    const submitForReview = mode === 'submit';
    if (!title.trim() || !content.trim()) return Alert.alert('Completa el devocional', 'Escribe un título y la reflexión.');
    setBusy(true);
    try {
      const fields = { titulo: title.trim(), resumen: summary.trim(), contenido: content.trim(), introduccion_html: editorHtml(summary), contenido_html: editorHtml(content), versiculo: verse.trim(), categorias: categories, imagen_url: image.trim() || null, cover_alt: coverAlt.trim() || null, oracion_html: prayer.trim() ? editorHtml(prayer) : null };
      let id = editing?.id;
      const payload = { pending_content: fields, pending_fecha_publicacion: publishAt.toISOString(), updated_at: new Date().toISOString() };
      if (id) {
        const { error } = await supabase.from('devocionales').update(payload).eq('id', id);
        if (error) throw error;
      } else {
        const slug = `${title.trim().toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${Date.now().toString(36)}`;
        const { data, error } = await supabase.from('devocionales').insert({ ...payload, slug, created_by: userId, autora: author }).select('id').single();
        if (error) throw error;
        id = data.id;
      }
      if (submitForReview && id) {
        const { error } = await supabase.rpc('devocional_submit_for_review', { p_id: id });
        if (error) throw error;
      }
      // Super Admin publishes (or schedules) directly, without review.
      if (mode === 'publish' && id && access?.isSuperAdmin) {
        const { error } = await supabase.rpc('devocional_approve_and_publish', { p_id: id, p_fecha: publishAt.toISOString() });
        if (error) throw error;
      }
      setModal(false); await load();
      Alert.alert(mode === 'submit' ? 'Enviado a revisión' : mode === 'publish' ? (publishAt.getTime() > Date.now() ? 'Devocional programado' : 'Devocional publicado') : 'Borrador guardado');
    } catch (error) { Alert.alert('No se pudo guardar', error instanceof Error ? error.message : ''); }
    finally { setBusy(false); }
  };

  const approve = (article: Article) => {
    const date = article.pending_fecha_publicacion ? new Date(article.pending_fecha_publicacion) : new Date();
    setApprovalDate(Number.isNaN(date.getTime()) ? new Date() : date);
    setApprovalArticle(article);
  };

  const confirmApproval = async () => {
    if (!approvalArticle) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc('devocional_approve_and_publish', { p_id: approvalArticle.id, p_fecha: approvalDate.toISOString() });
      if (error) throw error;
      setApprovalArticle(null); await load(); Alert.alert('Devocional aprobado y publicado');
    } catch (error) { Alert.alert('No se pudo publicar', error instanceof Error ? error.message : ''); }
    finally { setBusy(false); }
  };

  const claimReview = async (article: Article) => {
    setBusy(true);
    try { const { error } = await supabase.rpc('devocional_claim_review', { p_id: article.id }); if (error) throw error; await load(); }
    catch (error) { Alert.alert('No se pudo tomar la revisión', error instanceof Error ? error.message : ''); }
    finally { setBusy(false); }
  };

  const releaseReview = async (article: Article) => {
    setBusy(true);
    try { const { error } = await supabase.rpc('devocional_release_review', { p_id: article.id }); if (error) throw error; await load(); Alert.alert('Revisión liberada', 'El artículo volvió a la cola para que otra persona lo revise.'); }
    catch (error) { Alert.alert('No se pudo liberar la revisión', error instanceof Error ? error.message : ''); }
    finally { setBusy(false); }
  };

  const previewArticleContent = (article: Article) => setPreviewArticle(article);

  const showHistory = async (article: Article) => {
    setHistoryArticle(article); setHistory([]); setHistoryLoading(true);
    try {
      const { data, error } = await supabase.from('devocional_historial').select('id,accion,nota,actor_email,created_at').eq('devocional_id', article.id).order('created_at', { ascending: false });
      if (error) throw error;
      setHistory((data ?? []) as HistoryEntry[]);
    } catch (error) { Alert.alert('No se pudo cargar el historial', error instanceof Error ? error.message : ''); }
    finally { setHistoryLoading(false); }
  };

  const submitChangeRequest = async () => {
    if (!changeRequest || !changeNote.trim()) return Alert.alert('Escribe una nota', 'Indica qué cambios necesita el devocional.');
    setBusy(true);
    try {
      const { error } = await supabase.rpc('devocional_request_changes', { p_id: changeRequest.id, p_nota: changeNote.trim() });
      if (error) throw error;
      setChangeRequest(null); setChangeNote(''); await load(); Alert.alert('Solicitud enviada al editor');
    } catch (error) { Alert.alert('No se pudo solicitar cambios', error instanceof Error ? error.message : ''); }
    finally { setBusy(false); }
  };

  const articleAction = (article: Article, action: 'delete' | 'withdraw' | 'unpublish' | 'publish') => Alert.alert(
    action === 'delete' ? 'Eliminar devocional' : action === 'withdraw' ? 'Retirar de revisión' : action === 'unpublish' ? 'Devolver a borrador' : 'Publicar devocional',
    action === 'delete' ? '¿Eliminar este devocional? Esta acción lo ocultará y conservará su historial.' : `¿${action === 'withdraw' ? 'Retirar' : action === 'unpublish' ? 'Devolver a borrador' : 'Publicar'} “${article.titulo}”?`,
    [
      { text: 'Cancelar', style: 'cancel' },
      { text: action === 'delete' ? 'Eliminar' : 'Continuar', style: action === 'delete' ? 'destructive' : 'default', onPress: async () => {
        setBusy(true);
        try {
          const result = action === 'delete'
            ? await supabase.rpc('devocional_soft_delete', { p_id: article.id })
            : action === 'withdraw'
              ? await supabase.rpc('devocional_withdraw', { p_id: article.id })
              : await supabase.rpc('devocional_unpublish', { p_id: article.id });
          if (result.error) throw result.error;
          await load();
        } catch (error) { Alert.alert('No se pudo completar la acción', error instanceof Error ? error.message : ''); }
        finally { setBusy(false); }
      } },
    ],
  );

  if (!ready) return <View style={s.center}><ActivityIndicator color={C.wine} /></View>;
  if (!access) return <AdminLogin />;
  if (access.isRevoked || !canAdmin(access,'devotionals','view')) return <View style={s.page}><Row icon="lock-closed" label="Tu cuenta no tiene acceso a devocionales." chevron={false} /></View>;
  const editor = !access.isSuperAdmin && canAdmin(access,'devotionals','create');
  const reviewer = !access.isSuperAdmin && canAdmin(access,'devotionals','publish');
  const visibleArticles = articles.filter((article) => {
    const stateMatches = articleFilter === 'all' || (articleFilter === 'published' ? article.publicado : !article.publicado);
    const query = articleQuery.trim().toLocaleLowerCase('es');
    const title = String(article.pending_content?.titulo ?? article.titulo ?? '').toLocaleLowerCase('es');
    return stateMatches && (!query || title.includes(query) || String(article.autora || '').toLocaleLowerCase('es').includes(query));
  });
  const reviewContent = previewArticle?.pending_content;
  const reviewImage = String(reviewContent?.imagen_url ?? previewArticle?.imagen_url ?? '');
  const reviewTitle = String(reviewContent?.titulo ?? previewArticle?.titulo ?? '');
  const reviewAuthor = String(previewArticle?.autora ?? '');
  const reviewVerse = String(reviewContent?.versiculo ?? previewArticle?.versiculo ?? '');
  const reviewSummary = toEditorText(String(reviewContent?.introduccion_html ?? reviewContent?.resumen ?? previewArticle?.introduccion_html ?? previewArticle?.resumen ?? ''));
  const reviewBody = toEditorText(String(reviewContent?.contenido_html ?? reviewContent?.contenido ?? previewArticle?.contenido_html ?? previewArticle?.contenido ?? ''));

  return (
    <>
      <Stack.Screen options={{ title: 'Devocionales', headerRight: () => editor || access.isSuperAdmin ? <Pressable accessibilityRole="button" accessibilityLabel="Nuevo devocional" onPress={() => open()} hitSlop={12} style={{ paddingHorizontal: 8 }}><Ionicons name="add-circle" size={27} color={C.wine} /></Pressable> : null }} />
      <ScrollView contentContainerStyle={s.page} refreshControl={pull.control}>
        <Text style={s.kicker}>{reviewer ? 'REVISIÓN EDITORIAL' : 'CENTRO EDITORIAL'}</Text>
        <Text style={s.title}>{reviewer ? 'Por revisar' : 'Devocionales'}</Text>
        <Text style={s.subtitle}>{editor ? 'Escribe y envía tus reflexiones al equipo para su revisión.' : reviewer ? 'Revisa las reflexiones enviadas por el equipo.' : 'Administra los artículos de la comunidad.'}</Text>
        {!reviewer ? <>
          <View style={s.articleSearch}><Ionicons name="search" size={17} color={C.muted} /><TextInput value={articleQuery} onChangeText={setArticleQuery} placeholder="Buscar devocional" placeholderTextColor="#a28f8c" style={s.articleSearchInput} /></View>
          <View style={s.filterChips}>{(['all', 'published', 'draft'] as const).map((filter) => <Pressable key={filter} onPress={() => setArticleFilter(filter)} style={[s.filterChip, articleFilter === filter && s.filterChipActive]}><Text style={[s.filterChipText, articleFilter === filter && s.filterChipTextActive]}>{filter === 'all' ? 'Todos' : filter === 'published' ? 'Publicados' : 'Borradores'}</Text></Pressable>)}</View>
        </> : null}
        {loading ? <ActivityIndicator color={C.wine} style={{ marginTop: 30 }} /> : <View style={s.articleCollection}>
          <View style={s.collectionHeading}><Text style={s.collectionTitle}>{visibleArticles.length} {visibleArticles.length === 1 ? 'artículo' : 'artículos'}</Text><Ionicons name="journal-outline" size={17} color={C.wine} /></View>
          <Text style={s.gestureHint}>Desliza a la derecha para editar y a la izquierda para eliminar.</Text>
          {visibleArticles.map((article) => {
            const articleTitle = String(article.pending_content?.titulo || article.titulo || 'Sin título');
            const reviewItem = ['pendiente_revision', 'en_revision'].includes(article.estado) && !article.publicado;
            const isOwnArticle = article.created_by === userId;
            const reviewerQueueItem = reviewer && reviewItem && !isOwnArticle;
            const canEditArticle = article.estado !== 'eliminado' && (access.isSuperAdmin || (canAdmin(access,'devotionals','edit') && isOwnArticle && ['borrador', 'cambios_solicitados', 'publicado'].includes(article.estado)));
            const canDelete = access.isSuperAdmin || (canAdmin(access,'devotionals','delete') && isOwnArticle && !article.publicado);
            return <AdminGestureRow key={article.id} onEdit={canEditArticle ? () => open(article) : undefined} onDelete={canDelete ? () => articleAction(article, 'delete') : undefined} stepHeight={112}>
              <View style={s.articleCard}>
              <Row icon={reviewerQueueItem ? 'eye' : 'book'} tint={reviewerQueueItem ? C.gold2 : C.wine} label={articleTitle} sub={`${article.estado || (article.publicado ? 'Publicado' : 'Borrador')} · ${article.autora || 'Sin autora'}${article.categorias?.length ? ` · ${article.categorias.join(', ')}` : ''}`} onPress={() => reviewerQueueItem ? previewArticleContent(article) : canEditArticle ? open(article) : previewArticleContent(article)} />
              <View style={s.articleActions}>
                <Pressable onPress={() => showHistory(article)} style={s.articleAction}><Ionicons name="time-outline" size={15} color={C.wine} /><Text style={s.articleActionText}>Historial</Text></Pressable>
                  {reviewerQueueItem && article.estado === 'pendiente_revision' ? <Pressable onPress={() => void claimReview(article)} style={s.articleAction}><Ionicons name="hand-left-outline" size={15} color={C.wine} /><Text style={s.articleActionText}>Tomar revisión</Text></Pressable> : reviewerQueueItem && article.reviewer_id === userId ? <>
                  <Pressable onPress={() => { setChangeRequest(article); setChangeNote(''); }} style={s.articleAction}><Ionicons name="chatbox-ellipses-outline" size={15} color={C.wine} /><Text style={s.articleActionText}>Solicitar cambios</Text></Pressable>
                  <Pressable onPress={() => void releaseReview(article)} style={s.articleAction}><Ionicons name="return-down-back-outline" size={15} color={C.wine} /><Text style={s.articleActionText}>Liberar revisión</Text></Pressable>
                  <Pressable onPress={() => approve(article)} style={s.articleAction}><Ionicons name="checkmark-circle-outline" size={15} color={C.wine} /><Text style={s.articleActionText}>Aprobar</Text></Pressable>
                </> : <>
                  {article.estado === 'pendiente_revision' && !article.publicado && (isOwnArticle || access.isSuperAdmin) && canAdmin(access,'devotionals','edit') ? <Pressable onPress={() => articleAction(article, 'withdraw')} style={s.articleAction}><Ionicons name="return-down-back-outline" size={15} color={C.wine} /><Text style={s.articleActionText}>Retirar</Text></Pressable> : null}
                  {access.isSuperAdmin && reviewItem && !isOwnArticle ? <Pressable onPress={() => approve(article)} style={s.articleAction}><Ionicons name="checkmark-circle-outline" size={15} color={C.wine} /><Text style={s.articleActionText}>Publicar</Text></Pressable> : null}
                  {(article.publicado || article.estado === 'programado') && access.isSuperAdmin ? <Pressable onPress={() => articleAction(article, 'unpublish')} style={s.articleAction}><Ionicons name="eye-off-outline" size={15} color={C.wine} /><Text style={s.articleActionText}>Retirar de la web</Text></Pressable> : null}
                </>}
              </View>
              </View>
            </AdminGestureRow>;
          })}
          {!visibleArticles.length ? <View style={s.emptyCollection}><Ionicons name="book-outline" size={23} color={C.wine} /><Text style={s.emptyCollectionTitle}>Sin artículos para mostrar</Text><Text style={s.emptyCollectionCopy}>Ajusta los filtros o crea un nuevo devocional.</Text></View> : null}
        </View>}
      </ScrollView>
      <SheetModal visible={modal} onRequestClose={() => setModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: C.bg }}>
          <View style={s.modalBar}>
            <Pressable onPress={() => preview ? setPreview(false) : setModal(false)}><Text style={s.action}>{preview ? 'Editar' : 'Cancelar'}</Text></Pressable>
            <Text style={s.modalTitle}>{preview ? 'Vista previa' : editing ? 'Editar devocional' : 'Nuevo devocional'}</Text>
            <Pressable disabled={busy} onPress={() => preview ? setPreview(false) : void save('draft')}><Text style={[s.action, { fontWeight: '700' }]}>{preview ? 'Listo' : busy ? '…' : 'Guardar'}</Text></Pressable>
          </View>
          {preview ? (
            <ScrollView contentContainerStyle={s.previewPage}>
              <Text style={s.previewKicker}>LECTURA · {dateTimeLabel(publishAt).toLocaleUpperCase()}</Text>
              <View style={s.previewHero}>
                {image ? <Image source={{ uri: image }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
                <LinearGradient colors={image ? ['rgba(35,19,20,0.02)', 'rgba(35,19,20,0.82)'] : ['#e9c2bc', '#8c4843']} style={StyleSheet.absoluteFill} />
                <View style={s.previewHeroContent}>
                  <Text style={s.previewByline}>{author || 'Equipo Mujeres con Propósito'}</Text>
                  <Text style={s.previewHeroTitle}>{title || 'Título del devocional'}</Text>
                </View>
              </View>
              {categories.length ? <View style={s.previewCategoryRow}>{categories.map((item) => <Text key={item} style={s.previewCategory}>{item}</Text>)}</View> : null}
              {verse ? <View style={s.previewVerseCard}><Ionicons name="sparkles" size={16} color={C.gold2} />{formattedText(verse, s.previewVerse)}</View> : null}
              {summary.trim() ? <View style={s.previewIntroCard}><Text style={s.previewSectionLabel}>INTRODUCCIÓN</Text>{formattedPreview(summary, s.previewIntroText)}</View> : null}
              <View style={s.previewReflection}>
                <View style={s.previewReflectionHeading}><Text style={s.previewSectionLabel}>REFLEXIÓN</Text><View style={s.previewReflectionRule} /></View>
                <View style={s.previewArticleBody}>{formattedPreview(content || 'La reflexión aparecerá aquí.')}</View>
              </View>
              <View style={s.previewEnd}><View style={s.previewEndLine} /><Ionicons name="heart" size={15} color={C.rose} /><View style={s.previewEndLine} /></View>
            </ScrollView>
          ) : (
            <>
              <ScrollView contentContainerStyle={s.editorPage} keyboardShouldPersistTaps="handled">
                <View style={s.editorIntro}>
                  <View style={s.editorIntroIcon}><Ionicons name="book" size={20} color={C.wine} /></View>
                  <View style={{ flex: 1 }}><Text style={s.kicker}>{editing ? 'EDICIÓN EDITORIAL' : 'NUEVO ARTÍCULO'}</Text><Text style={s.editorIntroText}>Prepara una reflexión clara y lista para compartir.</Text></View>
                </View>
                <Group header="Portada y publicación">
                  {image ? <Image source={{ uri: image }} style={s.coverPreview} contentFit="cover" /> : <LinearGradient colors={['#f7e5e1', '#ead0cb']} style={s.coverPlaceholder}><Ionicons name="image-outline" size={28} color={C.wine} /><Text style={s.coverPlaceholderText}>Tu portada aparecerá aquí</Text></LinearGradient>}
                  <Pressable onPress={() => void chooseCover()} style={s.coverButton} disabled={busy}><Ionicons name="image-outline" size={18} color={C.wine} /><Text style={s.coverButtonText}>{image ? 'Cambiar portada' : 'Elegir y recortar portada'}</Text></Pressable>
                  <InputRow label="URL de la portada (opcional)" value={image} onChangeText={setImage} placeholder="https://…" autoCapitalize="none" keyboardType="url" />
                  {image ? <InputRow label="Descripción de la imagen" value={coverAlt} onChangeText={setCoverAlt} placeholder="Opcional · si la dejas vacía se usa el título" maxLength={180} /> : null}
                  <Row icon="calendar-outline" label="Fecha de publicación" value={dateTimeLabel(publishAt)} onPress={() => setShowDatePicker(true)} />
                  <Row icon="time-outline" label="Hora de publicación" value={new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' }).format(publishAt)} onPress={() => setShowTimePicker(true)} />
                  {showDatePicker ? <View style={s.pickerCard}><DateTimePicker value={publishAt} mode="date" display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={onPublishDateChange} /><Pressable onPress={() => setShowDatePicker(false)} style={s.pickerDone}><Text style={s.pickerDoneText}>Listo</Text></Pressable></View> : null}
                  {showTimePicker ? <View style={s.pickerCard}><DateTimePicker value={publishAt} mode="time" display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={onPublishTimeChange} /><Pressable onPress={() => setShowTimePicker(false)} style={s.pickerDone}><Text style={s.pickerDoneText}>Listo</Text></Pressable></View> : null}
                </Group>
                <Group header="Datos del devocional">
                  <View style={s.textField}>
                    <View style={s.textFieldHeader}><Text style={s.textFieldLabel}>Título</Text><View style={s.editableTag}><Ionicons name="create-outline" size={11} color={C.wine} /><Text style={s.editableTagText}>EDITABLE</Text></View></View>
                    <TextInput value={title} onChangeText={setTitle} placeholder="Un título que inspire" placeholderTextColor="#a28f8c" style={s.textFieldInput} returnKeyType="next" />
                  </View>
                  <View style={s.authorInfo}>
                    <View style={s.authorInfoTop}>
                      <View style={s.authorIcon}><Ionicons name="person-circle-outline" size={19} color={C.wine} /></View>
                      <Text style={s.authorLabel}>Autora</Text>
                      <View style={s.readOnlyBadge}><Ionicons name="lock-closed" size={10} color={C.muted} /><Text style={s.readOnlyText}>AUTOMÁTICA</Text></View>
                    </View>
                    <Text style={s.authorName}>{author || 'Equipo Mujeres con Propósito'}</Text>
                    <Text style={s.authorNote}>Se asigna desde la cuenta editorial y permanece igual al editar el devocional.</Text>
                  </View>
                  <View style={s.textField}>
                    <View style={s.textFieldHeader}><Text style={s.textFieldLabel}>Versículo bíblico</Text><View style={s.editableTag}><Ionicons name="create-outline" size={11} color={C.wine} /><Text style={s.editableTagText}>EDITABLE</Text></View></View>
                    <TextInput value={verse} onChangeText={setVerse} placeholder="Salmos 23:1" placeholderTextColor="#a28f8c" style={s.textFieldInput} returnKeyType="next" />
                  </View>
                  <View style={s.contentField}>
                    <View style={s.textFieldHeader}><Text style={s.fieldLabel}>Introducción</Text><View style={s.editableTag}><Ionicons name="create-outline" size={11} color={C.wine} /><Text style={s.editableTagText}>EDITABLE</Text></View></View>
                    <TextInput multiline value={summary} onChangeText={setSummary} placeholder="Un breve resumen para presentar la reflexión…" placeholderTextColor="#a28f8c" style={s.summaryInput} />
                  </View>
                  <View style={s.contentField}>
                    <Text style={s.fieldLabel}>Categorías</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.categoryChips} keyboardShouldPersistTaps="handled">{DEVOTIONAL_CATEGORIES.map((category) => {
                      const selected = categories.includes(category);
                      return <Pressable key={category} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={() => setCategories((current) => selected ? current.filter((value) => value !== category) : [...current, category])} style={[s.categoryChip, selected && s.categoryChipSelected]}><Text style={[s.categoryChipText, selected && s.categoryChipTextSelected]}>{category}</Text></Pressable>;
                    })}</ScrollView>
                  </View>
                </Group>
                <View style={s.editorSection}>
                  <View style={s.editorSectionHeader}><View><Text style={s.kicker}>CONTENIDO · EDITABLE</Text><Text style={s.editorSectionTitle}>Tu reflexión</Text></View><Text style={s.wordCount}>{content.trim() ? content.trim().split(/\s+/).length : 0} palabras</Text></View>
                  <View style={s.richEditor}>
                    <View style={s.richToolbar}>
                      <Pressable accessibilityLabel="Negrita" onPress={() => applyMarkup('**')} style={s.richTool}><Text style={[s.richToolText, { fontWeight: '900' }]}>B</Text></Pressable>
                      <Pressable accessibilityLabel="Cursiva" onPress={() => applyMarkup('*')} style={s.richTool}><Text style={[s.richToolText, { fontStyle: 'italic' }]}>I</Text></Pressable>
                      <Pressable accessibilityLabel="Subrayado" onPress={() => applyMarkup('__')} style={s.richTool}><Text style={[s.richToolText, { textDecorationLine: 'underline' }]}>U</Text></Pressable>
                      <View style={s.toolbarDivider} />
                      <Pressable accessibilityLabel="Título de sección" onPress={() => applyBlock('## ')} style={s.richTool}><Text style={s.richToolText}>H₂</Text></Pressable>
                      <Pressable accessibilityLabel="Cita" onPress={() => applyBlock('> ')} style={s.richTool}><Ionicons name="chatbox-ellipses-outline" size={17} color={C.wine} /></Pressable>
                      <Pressable accessibilityLabel="Lista con viñetas" onPress={() => applyBlock('• ')} style={s.richTool}><Ionicons name="list" size={18} color={C.wine} /></Pressable>
                      <Pressable accessibilityLabel="Lista numerada" onPress={() => applyBlock('', true)} style={s.richTool}><Text style={s.richToolText}>1.</Text></Pressable>
                    </View>
                    <TextInput ref={contentInputRef} multiline value={content} onChangeText={setContent} onSelectionChange={(event) => setSelection(event.nativeEvent.selection)} placeholder="Escribe aquí la reflexión…" placeholderTextColor="#a28f8c" style={s.contentInput} />
                    <Text style={s.markupHint}>Selecciona texto para aplicar formato. Los títulos, citas y listas se conservan al publicar.</Text>
                  </View>
                </View>
                <View style={s.editorSection}>
                  <View style={s.editorSectionHeader}><View><Text style={s.kicker}>OPCIONAL</Text><Text style={s.editorSectionTitle}>Oración final</Text></View></View>
                  <View style={s.richEditor}>
                    <TextInput multiline value={prayer} onChangeText={setPrayer} accessibilityLabel="Oración final" placeholder="Una oración breve para cerrar el devocional…" placeholderTextColor="#a28f8c" style={[s.contentInput, { minHeight: 110 }]} />
                  </View>
                </View>
              </ScrollView>
              <View style={s.editorFooter}>
                <Pressable onPress={() => setPreview(true)} style={s.previewButton}><Ionicons name="eye-outline" size={18} color={C.wine} /><Text style={s.previewButtonText}>Vista previa</Text></Pressable>
                {(editor || access.isSuperAdmin) && (!editing || editing.created_by === userId) ? <Pressable onPress={() => void save('submit')} disabled={busy} style={access.isSuperAdmin ? s.previewButton : s.submit}><Text style={access.isSuperAdmin ? s.previewButtonText : s.submitText}>{busy ? 'Enviando…' : 'Enviar a revisión'}</Text></Pressable> : null}
                {access.isSuperAdmin ? <Pressable onPress={() => void save('publish')} disabled={busy} style={[s.submit, s.publish]}><Text style={s.submitText}>{busy ? 'Publicando…' : 'Publicar'}</Text></Pressable> : null}
              </View>
            </>
          )}
        </KeyboardAvoidingView>
      </SheetModal>
      <SheetModal visible={!!previewArticle} onRequestClose={() => setPreviewArticle(null)}>
        <View style={{ flex: 1, backgroundColor: C.bg }}>
          <View style={s.modalBar}><Pressable onPress={() => setPreviewArticle(null)}><Text style={s.action}>Cerrar</Text></Pressable><Text style={s.modalTitle}>Vista previa</Text><View style={{ width: 42 }} /></View>
          <ScrollView contentContainerStyle={s.previewPage}>
            <Text style={s.previewKicker}>ARTÍCULO EN REVISIÓN</Text>
            <View style={s.previewHero}>
              {reviewImage ? <Image source={{ uri: reviewImage }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
              <LinearGradient colors={reviewImage ? ['rgba(35,19,20,0.02)', 'rgba(35,19,20,0.82)'] : ['#e9c2bc', '#8c4843']} style={StyleSheet.absoluteFill} />
              <View style={s.previewHeroContent}><Text style={s.previewByline}>{reviewAuthor}</Text><Text style={s.previewHeroTitle}>{reviewTitle}</Text></View>
            </View>
            {reviewVerse ? <View style={s.previewVerseCard}><Ionicons name="sparkles" size={16} color={C.gold2} />{formattedText(reviewVerse, s.previewVerse)}</View> : null}
            {reviewSummary ? <View style={s.previewIntroCard}><Text style={s.previewSectionLabel}>INTRODUCCIÓN</Text>{formattedPreview(reviewSummary, s.previewIntroText)}</View> : null}
            <View style={s.previewReflection}><View style={s.previewReflectionHeading}><Text style={s.previewSectionLabel}>REFLEXIÓN</Text><View style={s.previewReflectionRule} /></View><View style={s.previewArticleBody}>{formattedPreview(reviewBody)}</View></View>
            <View style={s.previewEnd}><View style={s.previewEndLine} /><Ionicons name="heart" size={15} color={C.rose} /><View style={s.previewEndLine} /></View>
          </ScrollView>
        </View>
      </SheetModal>
      <SheetModal visible={!!historyArticle} onRequestClose={() => setHistoryArticle(null)}>
        <View style={{ flex: 1, backgroundColor: C.bg }}><View style={s.modalBar}><Text style={s.modalTitle}>Historial de cambios</Text><Pressable onPress={() => setHistoryArticle(null)}><Text style={s.action}>Cerrar</Text></Pressable></View>
          <ScrollView contentContainerStyle={s.page}>{historyLoading ? <ActivityIndicator color={C.wine} /> : history.length ? <Group header={historyArticle?.titulo}>{history.map((entry) => <Row key={entry.id} icon="time-outline" label={entry.accion.replaceAll('_', ' ')} sub={`${entry.actor_email || 'Equipo'} · ${dateTimeLabel(new Date(entry.created_at))}${entry.nota ? `\n${entry.nota}` : ''}`} chevron={false} />)}</Group> : <Group><Row label="Sin historial registrado" chevron={false} /></Group>}</ScrollView>
        </View>
      </SheetModal>
      <SheetModal visible={!!changeRequest} onRequestClose={() => setChangeRequest(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: C.bg }}>
          <View style={s.modalBar}><Pressable onPress={() => setChangeRequest(null)}><Text style={s.action}>Cancelar</Text></Pressable><Text style={s.modalTitle}>Solicitar cambios</Text><Pressable disabled={busy} onPress={() => void submitChangeRequest()}><Text style={s.action}>{busy ? 'Enviando…' : 'Enviar'}</Text></Pressable></View>
          <View style={s.changeNoteWrap}><Text style={s.fieldLabel}>Explica qué debe ajustar la autora</Text><TextInput multiline value={changeNote} onChangeText={setChangeNote} placeholder="Escribe una nota para la autora…" placeholderTextColor="#a28f8c" style={s.changeNote} /></View>
        </KeyboardAvoidingView>
      </SheetModal>
      <SheetModal visible={!!approvalArticle} onRequestClose={() => setApprovalArticle(null)}>
        <View style={{ flex: 1, backgroundColor: C.bg }}><View style={s.modalBar}><Pressable onPress={() => setApprovalArticle(null)}><Text style={s.action}>Cancelar</Text></Pressable><Text style={s.modalTitle}>Aprobar y publicar</Text><Pressable disabled={busy} onPress={() => void confirmApproval()}><Text style={s.action}>{busy ? '…' : 'Publicar'}</Text></Pressable></View>
          <ScrollView contentContainerStyle={s.page}><Text style={s.subtitle}>{String(approvalArticle?.pending_content?.titulo ?? approvalArticle?.titulo ?? '')}</Text><Row icon="calendar-outline" label="Fecha de publicación" value={dateTimeLabel(approvalDate)} onPress={() => setShowDatePicker(true)} /><Row icon="time-outline" label="Hora de publicación" value={new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' }).format(approvalDate)} onPress={() => setShowTimePicker(true)} />
            {showDatePicker ? <DateTimePicker value={approvalDate} mode="date" display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={(event, date) => { if (date) setApprovalDate((current) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), current.getHours(), current.getMinutes())); if (Platform.OS !== 'ios' || event.type === 'dismissed') setShowDatePicker(false); }} /> : null}
            {showTimePicker ? <DateTimePicker value={approvalDate} mode="time" display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={(event, date) => { if (date) setApprovalDate((current) => new Date(current.getFullYear(), current.getMonth(), current.getDate(), date.getHours(), date.getMinutes())); if (Platform.OS !== 'ios' || event.type === 'dismissed') setShowTimePicker(false); }} /> : null}
          </ScrollView>
        </View>
      </SheetModal>
    </>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg }, page: { padding: 18, paddingBottom: 70 },
  editorPage: { paddingHorizontal: 18, paddingTop: 17, paddingBottom: 180 },
  editorIntro: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 16, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(166,75,67,0.10)', marginBottom: 4 },
  editorIntroIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: C.blush, alignItems: 'center', justifyContent: 'center' },
  editorIntroText: { fontFamily: sans, color: C.muted, fontSize: 13, lineHeight: 18, marginTop: 3 },
  authorInfo: { paddingHorizontal: 16, paddingVertical: 14, gap: 6, backgroundColor: '#fff' },
  authorInfoTop: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  authorIcon: { width: 27, height: 27, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: C.blush },
  authorLabel: { color: C.muted, fontFamily: sans, fontSize: 13, fontWeight: '700', flex: 1 },
  readOnlyBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 9, paddingHorizontal: 8, paddingVertical: 5, backgroundColor: '#f6f0ef' },
  readOnlyText: { color: C.muted, fontFamily: sans, fontSize: 8, fontWeight: '800', letterSpacing: 0.6 },
  authorName: { color: C.ink, fontFamily: sans, fontSize: 16, lineHeight: 22, fontWeight: '700', flexShrink: 1 },
  authorNote: { color: C.muted, fontFamily: sans, fontSize: 11, lineHeight: 16 },
  textField: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  textFieldHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  textFieldLabel: { color: C.muted, fontFamily: sans, fontSize: 13, fontWeight: '700' },
  editableTag: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, backgroundColor: C.blush, paddingHorizontal: 7, paddingVertical: 4 },
  editableTagText: { color: C.wine, fontFamily: sans, fontSize: 8, fontWeight: '800', letterSpacing: 0.55 },
  textFieldInput: { minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(166,75,67,0.12)', backgroundColor: '#faf7f6', paddingHorizontal: 12, paddingVertical: 9, fontFamily: sans, fontSize: 15, lineHeight: 21, color: C.ink },
  coverPlaceholder: { height: 155, margin: 12, borderRadius: 17, alignItems: 'center', justifyContent: 'center', gap: 8 },
  coverPlaceholderText: { color: C.wine, fontFamily: sans, fontSize: 12, fontWeight: '600' },
  editorSection: { marginTop: 26 },
  editorSectionHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginHorizontal: 4, marginBottom: 11 },
  editorSectionTitle: { color: C.ink, fontFamily: 'Georgia', fontSize: 25, fontWeight: '700', marginTop: 3 },
  wordCount: { color: C.muted, fontFamily: sans, fontSize: 11, marginBottom: 3 },
  richEditor: { backgroundColor: '#fff', borderRadius: 21, borderWidth: 1, borderColor: 'rgba(63,38,35,0.08)', padding: 12, boxShadow: '0 8px 22px rgba(63,38,35,0.05)' },
  editorFooter: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14, backgroundColor: 'rgba(250,245,244,0.98)', borderTopWidth: StyleSheet.hairlineWidth, borderColor: C.line, gap: 8 },
  kicker: { fontFamily: sans, fontSize: 11, fontWeight: '700', letterSpacing: 1.4, color: C.wine, marginTop: 6 }, title: { fontFamily: sans, fontSize: 31, fontWeight: '700', letterSpacing: -0.8, color: C.ink, marginTop: 5 }, subtitle: { fontFamily: sans, fontSize: 14, lineHeight: 20, color: C.muted, marginTop: 4, marginBottom: 20 },
  modalBar: { height: 58, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.line }, modalTitle: { fontFamily: sans, fontSize: 16, fontWeight: '600', color: C.ink }, action: { fontFamily: sans, fontSize: 15, color: C.wine },
  articleSearch: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 12, borderRadius: 13, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, marginBottom: 12 }, articleSearchInput: { flex: 1, fontFamily: sans, color: C.ink, fontSize: 14 },
  filterChips: { flexDirection: 'row', gap: 7, marginBottom: 8 }, filterChip: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999, backgroundColor: C.fill }, filterChipActive: { backgroundColor: C.wine }, filterChipText: { fontFamily: sans, fontSize: 12, fontWeight: '600', color: C.muted }, filterChipTextActive: { color: '#fff' },
  categoryChips: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2, paddingRight: 18 }, categoryChip: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 999, backgroundColor: C.fill }, categoryChipSelected: { backgroundColor: C.wine }, categoryChipText: { fontFamily: sans, color: C.muted, fontSize: 12, fontWeight: '600' }, categoryChipTextSelected: { color: '#fff' },
  articleCollection: { marginTop: 18, gap: 11 }, collectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 5, paddingBottom: 2 }, collectionTitle: { fontFamily: sans, fontSize: 13, fontWeight: '800', letterSpacing: 0.8, color: C.muted, textTransform: 'uppercase' }, gestureHint: { fontFamily: sans, fontSize: 12, lineHeight: 16, color: C.muted, paddingHorizontal: 5 }, articleCard: { padding: 10, borderRadius: 20, backgroundColor: C.card, borderWidth: 1, borderColor: 'rgba(63,38,35,0.06)', boxShadow: '0 7px 19px rgba(63,38,35,0.055)' }, articleActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, paddingHorizontal: 7, paddingTop: 3, paddingBottom: 4 }, articleAction: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 12, backgroundColor: '#f8eeec' }, articleActionText: { fontFamily: sans, fontSize: 11, fontWeight: '700', color: C.wine },
  emptyCollection: { alignItems: 'center', padding: 25, gap: 7, backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.line }, emptyCollectionTitle: { fontFamily: 'Georgia', fontSize: 19, fontWeight: '700', color: C.ink }, emptyCollectionCopy: { fontFamily: sans, fontSize: 12, lineHeight: 18, color: C.muted, textAlign: 'center' },
  contentField: { padding: 16 }, fieldLabel: { fontFamily: sans, color: C.muted, fontSize: 12, fontWeight: '600', marginBottom: 8 }, summaryInput: { minHeight: 100, textAlignVertical: 'top', backgroundColor: '#faf7f6', borderRadius: 13, padding: 12, fontFamily: sans, color: C.ink, fontSize: 15, lineHeight: 23 }, contentInput: { minHeight: 250, textAlignVertical: 'top', paddingHorizontal: 5, paddingVertical: 8, fontFamily: sans, color: C.ink, fontSize: 16, lineHeight: 26, textAlign: 'left' },
  richToolbar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 7, marginBottom: 10, paddingBottom: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.line }, richTool: { minWidth: 34, height: 34, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 9, borderRadius: 11, backgroundColor: '#f8eeec' }, richToolText: { color: C.wine, fontSize: 15, fontWeight: '700' }, toolbarDivider: { width: 1, height: 22, backgroundColor: C.separator, marginHorizontal: 1 }, markupHint: { fontFamily: sans, color: C.muted, fontSize: 11, lineHeight: 16, marginTop: 8 },
  coverPreview: { width: '100%', height: 220, borderRadius: 18, backgroundColor: C.sand, marginBottom: 8 }, coverButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12 }, coverButtonText: { fontFamily: sans, color: C.wine, fontWeight: '600', fontSize: 14 },
  pickerCard: { marginTop: 8, marginHorizontal: 12, padding: 8, borderRadius: 16, backgroundColor: C.card }, pickerDone: { alignSelf: 'flex-end', padding: 10 }, pickerDoneText: { fontFamily: sans, color: C.wine, fontWeight: '700' },
  previewButton: { minHeight: 48, borderRadius: 15, borderWidth: 1, borderColor: 'rgba(166,75,67,0.18)', backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, previewButtonText: { fontFamily: sans, color: C.wine, fontWeight: '700', fontSize: 14 },
  previewPage: { paddingHorizontal: 22, paddingTop: 20, paddingBottom: 50 }, previewKicker: { color: C.wine, fontFamily: sans, fontSize: 10, fontWeight: '800', letterSpacing: 1.3, marginBottom: 12 }, previewHero: { minHeight: 330, borderRadius: 27, overflow: 'hidden', backgroundColor: '#92504a', justifyContent: 'flex-end', borderWidth: 1, borderColor: 'rgba(255,255,255,0.85)', boxShadow: '0 14px 28px rgba(82,42,39,0.15)' }, previewHeroContent: { padding: 21, paddingTop: 70 }, previewByline: { color: 'rgba(255,255,255,0.84)', fontFamily: sans, fontSize: 10, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }, previewHeroTitle: { color: '#fff', fontFamily: 'Georgia', fontSize: 32, lineHeight: 38, fontWeight: '700' }, previewCategoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 15 }, previewCategory: { overflow: 'hidden', color: C.wine, backgroundColor: C.blush, fontFamily: sans, fontSize: 10, fontWeight: '700', borderRadius: 99, paddingHorizontal: 11, paddingVertical: 7 }, previewVerseCard: { borderRadius: 19, backgroundColor: '#fff', padding: 17, gap: 10, marginTop: 21, marginBottom: 19, borderWidth: 1, borderColor: 'rgba(166,75,67,0.10)' }, previewIntroCard: { marginTop: 22, paddingHorizontal: 17, paddingVertical: 16, borderRadius: 19, backgroundColor: '#f6e9e6', borderLeftWidth: 3, borderLeftColor: C.rose }, previewSectionLabel: { color: C.wine, fontFamily: sans, fontSize: 9, fontWeight: '800', letterSpacing: 1.35 }, previewIntroText: { color: C.muted, fontFamily: sans, fontSize: 15, lineHeight: 24, textAlign: 'justify', marginTop: 8 }, previewReflection: { marginTop: 27 }, previewReflectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 2 }, previewReflectionRule: { flex: 1, height: 1, backgroundColor: 'rgba(166,75,67,0.19)' }, previewArticleBody: { marginTop: 5 }, previewBlock: { marginTop: 15 }, previewSubheading: { color: C.ink, fontFamily: 'Georgia', fontSize: 23, lineHeight: 29, fontWeight: '700' }, previewQuote: { borderLeftWidth: 2, borderLeftColor: C.rose, paddingLeft: 14, marginVertical: 11 }, previewQuoteText: { color: C.wine, fontFamily: 'Georgia', fontSize: 18, lineHeight: 27, fontStyle: 'italic', textAlign: 'justify' }, previewListRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, marginTop: 7 }, previewBullet: { color: C.wine, fontFamily: sans, fontSize: 15, fontWeight: '800' }, previewEnd: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 11, marginTop: 27 }, previewEndLine: { width: 48, height: 1, backgroundColor: 'rgba(166,75,67,0.18)' },
  previewHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }, previewTitle: { fontFamily: 'Georgia', fontSize: 30, lineHeight: 36, fontWeight: '700', color: C.ink, marginTop: 12 }, previewMeta: { fontFamily: sans, fontSize: 13, color: C.muted, marginTop: 8 }, previewVerse: { fontFamily: 'Georgia', fontStyle: 'italic', color: C.wine, fontSize: 19, lineHeight: 27, marginTop: 0, textAlign: 'left' }, previewSummary: { fontFamily: sans, color: C.muted, fontSize: 16, lineHeight: 24, marginTop: 16, textAlign: 'justify' }, previewBody: { fontFamily: sans, color: C.ink, fontSize: 16, lineHeight: 26, textAlign: 'justify' },
  changeNoteWrap: { padding: 18 }, changeNote: { minHeight: 170, borderRadius: 14, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, padding: 14, textAlignVertical: 'top', fontFamily: sans, color: C.ink, fontSize: 15, lineHeight: 22 },
  submit: { minHeight: 50, borderRadius: 15, backgroundColor: C.wine, alignItems: 'center', justifyContent: 'center', marginTop: 16 }, submitText: { fontFamily: sans, color: '#fff', fontWeight: '700', fontSize: 15 },
  publish: { backgroundColor: C.ink },
});
