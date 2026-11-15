// Live Activity for an upcoming/ongoing meeting: Dynamic Island + Lock Screen.
// Runs in the widget extension's isolated runtime: only @expo/ui/swift-ui
// components, no hooks, no module-scope constants (values live in the function).
import { HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle, lineLimit, monospacedDigit, padding } from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity, type LiveActivityEnvironment } from 'expo-widgets';

export type MeetingActivityProps = {
  titulo: string;
  /** Start time, ms since epoch (props must be JSON-serialisable). */
  startsAt: number;
  /** True once the meeting has started. */
  live: boolean;
  /** Platform name for the call to action, e.g. "Google Meet". */
  platform: string;
};

const MeetingActivity = (props: MeetingActivityProps, environment: LiveActivityEnvironment) => {
  'widget';
  const wine = '#A64B43';
  const live = '#D64545';
  const start = new Date(props.startsAt);
  const accent = props.live ? live : wine;
  const status = props.live ? 'EN VIVO' : 'EMPIEZA';
  const symbol = props.live ? 'dot.radiowaves.left.and.right' : 'video.fill';

  return {
    // Lock Screen
    banner: (
      <HStack spacing={12} modifiers={[padding({ all: 16 })]}>
        <Image systemName={symbol} size={26} color={accent} />
        <VStack alignment="leading" spacing={2}>
          <Text modifiers={[font({ size: 12, weight: 'bold' }), foregroundStyle(accent)]}>
            {props.live ? 'EN VIVO · Toca para unirte' : 'Mujeres con Propósito'}
          </Text>
          <Text modifiers={[font({ size: 17, weight: 'semibold' }), lineLimit(1)]}>{props.titulo}</Text>
          <Text modifiers={[font({ size: 13 }), foregroundStyle('secondary')]}>
            {props.live ? `Unirme por ${props.platform}` : 'Te avisaremos cuando empiece'}
          </Text>
        </VStack>
        <Spacer />
        {props.live ? (
          <Text modifiers={[font({ size: 15, weight: 'bold' }), foregroundStyle(live)]}>Unirme</Text>
        ) : (
          <Text date={start} dateStyle="timer" modifiers={[font({ size: 26, weight: 'bold' }), monospacedDigit(), foregroundStyle(wine)]} />
        )}
      </HStack>
    ),

    // Dynamic Island — compact (around the camera)
    compactLeading: <Image systemName={symbol} size={14} color={accent} />,
    compactTrailing: props.live ? (
      <Text modifiers={[font({ size: 13, weight: 'bold' }), foregroundStyle(live)]}>EN VIVO</Text>
    ) : (
      <Text date={start} dateStyle="timer" modifiers={[font({ size: 13, weight: 'semibold' }), monospacedDigit(), foregroundStyle(wine)]} />
    ),
    // Dynamic Island — minimal (another app is also using the island)
    minimal: <Image systemName={symbol} size={13} color={accent} />,

    // Dynamic Island — expanded (long press)
    expandedLeading: (
      <VStack alignment="leading" spacing={2} modifiers={[padding({ leading: 4 })]}>
        <Image systemName={symbol} size={22} color={accent} />
        <Text modifiers={[font({ size: 11, weight: 'bold' }), foregroundStyle(accent)]}>{status}</Text>
      </VStack>
    ),
    expandedTrailing: props.live ? (
      <Text modifiers={[font({ size: 15, weight: 'bold' }), foregroundStyle(live)]}>Ahora</Text>
    ) : (
      <Text date={start} dateStyle="timer" modifiers={[font({ size: 22, weight: 'bold' }), monospacedDigit(), foregroundStyle(wine)]} />
    ),
    expandedCenter: (
      <Text modifiers={[font({ size: 16, weight: 'semibold' }), lineLimit(1)]}>{props.titulo}</Text>
    ),
    expandedBottom: (
      <HStack spacing={6} modifiers={[padding({ top: 6 })]}>
        <Image systemName="arrow.up.right.video.fill" size={14} color={accent} />
        <Text modifiers={[font({ size: 14, weight: 'semibold' }), foregroundStyle(accent)]}>
          {props.live ? `Toca para unirte por ${props.platform}` : `Unirme por ${props.platform} al empezar`}
        </Text>
      </HStack>
    ),
  };
};

export default createLiveActivity('MeetingActivity', MeetingActivity);
