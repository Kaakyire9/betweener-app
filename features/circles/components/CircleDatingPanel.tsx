import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { normalizeProfilePhotoUri } from '@/lib/profile/media';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useCircleDating, type CircleDatingConnection } from '../hooks/use-circle-dating';
import { CircleDiscoveryIntroduction } from './CircleDiscoveryIntroduction';

type Props = {
  circleId: string;
  circleName: string;
  mode: 'discover' | 'connections';
  onOpenProfile: (profileId: string) => void;
  onSendIntent: (profileId: string, name: string) => void;
  onOpenChat: (profileId: string, name: string) => void;
  onExploreCircle?: () => void;
};

const connectionLabel = (connection: CircleDatingConnection) => {
  if (connection.matchId || connection.intentStatus === 'matched') return 'Matched';
  if (connection.intentStatus === 'accepted') return 'Accepted';
  return connection.direction === 'received' ? 'Intent received' : 'Intent sent';
};

export function CircleDatingPanel({
  circleId,
  circleName,
  mode,
  onOpenProfile,
  onSendIntent,
  onOpenChat,
  onExploreCircle,
}: Props) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const isDark = (colorScheme ?? 'light') === 'dark';
  const styles = createStyles(theme, isDark);
  const dating = useCircleDating(circleId, mode === 'connections');

  if (dating.loading && !dating.preference) {
    return (
      <View style={styles.stateCard}>
        <MaterialCommunityIcons name="account-heart-outline" size={26} color={theme.tint} />
        <Text style={styles.stateTitle}>Preparing your Circle</Text>
        <Text style={styles.stateBody}>Finding safe, intentional ways to connect.</Text>
      </View>
    );
  }

  if (dating.error && !dating.preference) {
    return (
      <View style={styles.stateCard}>
        <MaterialCommunityIcons name="cloud-alert-outline" size={26} color={theme.tint} />
        <Text style={styles.stateTitle}>Discovery is not ready yet</Text>
        <Text style={styles.stateBody}>{dating.error}</Text>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => void dating.refresh()}>
          <Text style={styles.secondaryButtonText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!dating.preference?.isMember) {
    return (
      <View style={styles.stateCard}>
        <MaterialCommunityIcons name="account-lock-outline" size={26} color={theme.tint} />
        <Text style={styles.stateTitle}>Join to meet people here</Text>
        <Text style={styles.stateBody}>Circle discovery is available only to active members of {circleName}.</Text>
      </View>
    );
  }

  if (mode === 'connections') {
    return (
      <View style={styles.section}>
        <View style={styles.sectionHeading}>
          <View style={styles.sectionHeadingCopy}>
            <Text style={styles.eyebrow}>YOUR CONNECTIONS</Text>
            <Text style={styles.sectionTitle}>Shared context, clearer next steps</Text>
          </View>
          <TouchableOpacity accessibilityLabel="Refresh Circle connections" onPress={() => void dating.refresh()}>
            <MaterialCommunityIcons name="refresh" size={20} color={theme.textMuted} />
          </TouchableOpacity>
        </View>
        {dating.connections.length ? dating.connections.map((connection) => {
          const isMatched = Boolean(connection.matchId || connection.intentStatus === 'matched');
          const uri = normalizeProfilePhotoUri(connection.avatarUrl);
          return (
            <Pressable key={connection.requestId} style={styles.connectionCard} onPress={() => onOpenProfile(connection.peerProfileId)}>
              {uri ? (
                <Image source={{ uri }} style={styles.connectionAvatar} />
              ) : (
                <View style={styles.connectionAvatarFallback}>
                  <MaterialCommunityIcons name="account-outline" size={24} color={theme.textMuted} />
                </View>
              )}
              <View style={styles.connectionCopy}>
                <Text style={styles.connectionName} numberOfLines={1}>
                  {connection.fullName}{connection.age ? `, ${connection.age}` : ''}
                </Text>
                <Text style={styles.connectionStatus}>{connectionLabel(connection)}</Text>
              </View>
              {isMatched ? (
                <TouchableOpacity style={styles.compactPrimary} onPress={() => onOpenChat(connection.peerProfileId, connection.fullName)}>
                  <Text style={styles.compactPrimaryText}>Chat</Text>
                </TouchableOpacity>
              ) : connection.direction === 'received' ? (
                <TouchableOpacity style={styles.compactSecondary} onPress={() => onOpenProfile(connection.peerProfileId)}>
                  <Text style={styles.compactSecondaryText}>Review</Text>
                </TouchableOpacity>
              ) : (
                <MaterialCommunityIcons name="clock-outline" size={20} color={theme.textMuted} />
              )}
            </Pressable>
          );
        }) : (
          <View style={styles.stateCard}>
            <MaterialCommunityIcons name="heart-outline" size={26} color={theme.tint} />
            <Text style={styles.stateTitle}>No Circle connections yet</Text>
            <Text style={styles.stateBody}>Start in Discover and send an Intent. Sent or received Intents will appear here, and an accepted Intent opens the existing Chat.</Text>
          </View>
        )}
      </View>
    );
  }

  if (!dating.preference?.optedIn) {
    return (
      <View style={styles.consentCard}>
        <View style={styles.consentIcon}>
          <MaterialCommunityIcons name="account-heart-outline" size={27} color={theme.tint} />
        </View>
        <Text style={styles.consentEyebrow}>MEET THROUGH SOMETHING YOU ALREADY SHARE</Text>
        <Text style={styles.consentTitle}>Discover people in this Circle</Text>
        <Text style={styles.consentBody}>
          Meet members of {circleName} who are also open to meaningful connection.
        </Text>
        <View style={styles.consentPoint}>
          <MaterialCommunityIcons name="shield-check-outline" size={18} color={theme.tint} />
          <Text style={styles.consentPointText}>Your participation is private. Only eligible members can discover you.</Text>
        </View>
        <TouchableOpacity
          accessibilityLabel="Start discovering people in this Circle"
          style={[styles.primaryButton, dating.saving && styles.buttonDisabled]}
          disabled={dating.saving}
          onPress={() => void dating.setOptedIn(true)}
        >
          <Text style={styles.primaryButtonText}>{dating.saving ? 'Starting discovery…' : 'Start discovering'}</Text>
        </TouchableOpacity>
        {onExploreCircle ? (
          <TouchableOpacity accessibilityLabel="Not now, return to Circle" style={styles.notNowButton} onPress={onExploreCircle}>
            <Text style={styles.notNowText}>Not now</Text>
          </TouchableOpacity>
        ) : null}
        <Text style={styles.trustText}>You can pause anytime.</Text>
        {dating.error ? <Text style={styles.errorText}>{dating.error}</Text> : null}
      </View>
    );
  }

  const candidate = dating.candidates[0];
  if (!candidate) {
    return (
      <View style={styles.section}>
        <View style={styles.discoveryControls}>
          <View>
            <Text style={styles.eyebrow}>DISCOVERY ON</Text>
            <Text style={styles.discoveryPrivacy}>Only opted-in members can see one another</Text>
          </View>
          <TouchableOpacity accessibilityLabel="Pause Circle dating discovery" style={styles.pauseButton} disabled={dating.saving} onPress={() => void dating.setOptedIn(false)}>
            <Text style={styles.pauseText}>Pause</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.stateCard}>
          <MaterialCommunityIcons name="account-search-outline" size={28} color={theme.tint} />
          <Text style={styles.stateTitle}>No new introductions right now.</Text>
          <Text style={styles.stateBody}>We’ll show someone here when there’s a meaningful fit.</Text>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => void dating.refresh()}>
            <Text style={styles.secondaryButtonText}>Check again</Text>
          </TouchableOpacity>
          {onExploreCircle ? (
            <TouchableOpacity style={styles.notNowButton} onPress={onExploreCircle}>
              <Text style={styles.notNowText}>Explore the Circle</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <View style={styles.discoveryControls}>
        <View>
          <Text style={styles.eyebrow}>{circleName.toUpperCase()}</Text>
          <Text style={styles.discoveryPrivacy}>You already share this Circle.</Text>
        </View>
        <TouchableOpacity accessibilityLabel="Pause Circle dating discovery" style={styles.pauseButton} disabled={dating.saving} onPress={() => void dating.setOptedIn(false)}>
          <Text style={styles.pauseText}>Pause</Text>
        </TouchableOpacity>
      </View>

      <CircleDiscoveryIntroduction
        candidate={candidate}
        circleName={circleName}
        remainingCount={dating.candidates.length}
        onPass={() => void dating.passCandidate(candidate.profileId)}
        onOpenProfile={() => {
          void dating.logEvent('profile_opened', candidate.profileId);
          onOpenProfile(candidate.profileId);
        }}
        onSendIntent={() => {
          void dating.logEvent('intent_opened', candidate.profileId);
          onSendIntent(candidate.profileId, candidate.fullName);
        }}
      />
      {dating.error ? <Text style={styles.errorText}>{dating.error}</Text> : null}
    </View>
  );
}

const createStyles = (theme: typeof Colors.light, isDark: boolean) => StyleSheet.create({
  section: { gap: 14 },
  sectionHeading: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 },
  sectionHeadingCopy: { flex: 1, gap: 4 },
  eyebrow: { color: theme.tint, fontSize: 11, fontWeight: '800', letterSpacing: 1.4 },
  sectionTitle: { color: theme.text, fontFamily: 'PlayfairDisplay_700Bold', fontSize: 22 },
  stateCard: { alignItems: 'center', gap: 10, padding: 24, borderRadius: 24, borderWidth: 1, borderColor: theme.outline, backgroundColor: theme.backgroundSubtle },
  stateTitle: { color: theme.text, fontFamily: 'PlayfairDisplay_700Bold', fontSize: 20, textAlign: 'center' },
  stateBody: { color: theme.textMuted, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  consentCard: { gap: 13, padding: 22, borderRadius: 26, borderWidth: 1, borderColor: isDark ? 'rgba(76,214,190,0.28)' : 'rgba(0,128,128,0.2)', backgroundColor: theme.backgroundSubtle },
  consentIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? 'rgba(76,214,190,0.12)' : 'rgba(0,128,128,0.08)' },
  consentEyebrow: { color: theme.tint, fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  consentTitle: { color: theme.text, fontFamily: 'PlayfairDisplay_700Bold', fontSize: 27, lineHeight: 33 },
  consentBody: { color: theme.textMuted, fontSize: 15, lineHeight: 23 },
  consentPoint: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  consentPointText: { flex: 1, color: theme.textMuted, fontSize: 13, lineHeight: 18 },
  trustText: { color: theme.textMuted, fontSize: 11, lineHeight: 16, textAlign: 'center' },
  notNowButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  notNowText: { color: theme.textMuted, fontSize: 13, fontWeight: '700' },
  primaryButton: { minHeight: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.tint, paddingHorizontal: 18 },
  primaryButtonText: { color: theme.backgroundSubtle, fontWeight: '800', fontSize: 15 },
  secondaryButton: { minHeight: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.outline, paddingHorizontal: 18 },
  secondaryButtonText: { color: theme.text, fontWeight: '700' },
  buttonDisabled: { opacity: 0.58 },
  errorText: { color: theme.danger, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  discoveryControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  discoveryPrivacy: { marginTop: 4, color: theme.textMuted, fontSize: 12 },
  pauseButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  pauseText: { color: theme.textMuted, fontWeight: '700', padding: 8 },
  connectionCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderRadius: 20, borderWidth: 1, borderColor: theme.outline, backgroundColor: theme.backgroundSubtle },
  connectionAvatar: { width: 54, height: 54, borderRadius: 27 },
  connectionAvatarFallback: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background },
  connectionCopy: { flex: 1, gap: 4 },
  connectionName: { color: theme.text, fontWeight: '800', fontSize: 15 },
  connectionStatus: { color: theme.textMuted, fontSize: 12 },
  compactPrimary: { minHeight: 38, justifyContent: 'center', borderRadius: 19, backgroundColor: theme.tint, paddingHorizontal: 15 },
  compactPrimaryText: { color: theme.backgroundSubtle, fontWeight: '800' },
  compactSecondary: { minHeight: 38, justifyContent: 'center', borderRadius: 19, borderWidth: 1, borderColor: theme.outline, paddingHorizontal: 13 },
  compactSecondaryText: { color: theme.text, fontWeight: '700' },
});
