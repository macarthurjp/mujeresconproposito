import type { ComponentProps } from 'react';
import { Modal, Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { C } from '@/constants/theme';

/**
 * Full-height sheet. iOS shows a native page sheet; Android has no page sheet
 * and draws the modal edge to edge, so the content is kept clear of the
 * status bar and the gesture bar.
 */
export function SheetModal({ children, ...props }: Omit<ComponentProps<typeof Modal>, 'presentationStyle'>) {
  const insets = useSafeAreaInsets();
  return (
    <Modal animationType="slide" {...props} presentationStyle="pageSheet">
      {Platform.OS === 'android'
        ? <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top, paddingBottom: insets.bottom }}>{children}</View>
        : children}
    </Modal>
  );
}
