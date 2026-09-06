import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import CircleMemberPortraitCard, {
  type CircleMemberPortrait,
} from '@/components/circles/CircleMemberPortraitCard';
import CirclePulseReveal from '@/components/circles/CirclePulseReveal';
import { selectDailyPortraitLead } from '@/lib/circles/member-portrait-ranking';
import { useCirclePulsePalette } from '@/lib/circles/pulse/circle-pulse-theme';

type Props = {
  circleId: string;
  members: CircleMemberPortrait[];
  onOpenProfile: (profileId: string) => void;
  onOpenConversation?: (member: CircleMemberPortrait) => void;
  onManageMember?: (profileId: string) => void;
};

const firstName = (name: string) => name.trim().split(/\s+/)[0] || 'member';

export default function CircleMembersPortraitDirectory({
  circleId,
  members,
  onOpenProfile,
  onOpenConversation,
  onManageMember,
}: Props) {
  const palette = useCirclePulsePalette();
  const leadPool = members.some((member) => !member.isSelf && ['prompt', 'moment'].includes(member.conversationKind ?? ''))
    ? members.filter((member) => !member.isSelf && ['prompt', 'moment'].includes(member.conversationKind ?? ''))
    : members.filter((member) => !member.isSelf);
  const lead = selectDailyPortraitLead(leadPool, `circle-members:${circleId}`, (member) => member.profileId)
    ?? members[0]
    ?? null;
  const gridMembers = lead
    ? members.filter((member) => member.profileId !== lead.profileId)
    : members;
  const leadHasConversation = Boolean(
    lead
    && onOpenConversation
    && ['prompt', 'moment'].includes(lead.conversationKind ?? ''),
  );

  if (!lead) return null;

  return (
    <View style={styles.directory}>
      <View style={styles.intro}>
        <View style={[styles.introIcon, { borderColor: palette.tealBorder, backgroundColor: palette.tealSoft }]}>
          <MaterialCommunityIcons name="account-group-outline" size={20} color={palette.teal} />
        </View>
        <View style={styles.introCopy}>
          <Text style={[styles.introTitle, { color: palette.text }]}>People worth meeting</Text>
          <Text style={[styles.introBody, { color: palette.textMuted }]}>Shared context gives every introduction somewhere natural to begin.</Text>
        </View>
      </View>

      <CirclePulseReveal>
        <CircleMemberPortraitCard
          member={lead}
          featured
          onOpenProfile={onOpenProfile}
          primaryActionLabel={leadHasConversation
            ? lead.conversationKind === 'prompt' ? 'Open their answer' : 'Open their Moment'
            : null}
          primaryActionIcon={lead?.conversationKind === 'moment' ? 'image-multiple-outline' : 'comment-question-outline'}
          onPrimaryAction={leadHasConversation ? () => onOpenConversation?.(lead) : undefined}
          secondaryActionLabel={leadHasConversation ? `Meet ${firstName(lead.name)}` : null}
          onSecondaryAction={leadHasConversation ? () => onOpenProfile(lead.profileId) : undefined}
          onManage={onManageMember && !lead.isSelf ? () => onManageMember(lead.profileId) : undefined}
        />
      </CirclePulseReveal>

      {gridMembers.length > 0 ? (
        <View style={styles.gridSection}>
          <View style={styles.gridHeading}>
            <Text style={[styles.gridEyebrow, { color: palette.teal }]}>INSIDE THIS CIRCLE</Text>
            <Text style={[styles.gridCount, { color: palette.textMuted }]}>{members.length} {members.length === 1 ? 'person' : 'people'}</Text>
          </View>
          <View style={styles.grid}>
            {gridMembers.map((member, index) => (
              <CirclePulseReveal key={member.profileId} delay={Math.min(index * 35, 245)} style={styles.gridCell}>
                <CircleMemberPortraitCard
                  member={member}
                  onOpenProfile={onOpenProfile}
                  onManage={onManageMember && !member.isSelf ? () => onManageMember(member.profileId) : undefined}
                />
              </CirclePulseReveal>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  directory: { gap: 18 },
  intro: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  introIcon: { width: 46, height: 46, borderRadius: 23, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  introCopy: { flex: 1, minWidth: 0, gap: 3 },
  introTitle: { fontSize: 18, lineHeight: 23, fontFamily: 'PlayfairDisplay_700Bold' },
  introBody: { maxWidth: 430, fontSize: 11, lineHeight: 17 },
  gridSection: { gap: 10 },
  gridHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 2 },
  gridEyebrow: { fontSize: 9, lineHeight: 13, fontWeight: '900', letterSpacing: 1.3 },
  gridCount: { fontSize: 10, lineHeight: 14, fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  gridCell: { width: '48.35%' },
});
