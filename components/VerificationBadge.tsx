import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface VerificationBadgeProps {
  level: number;
  size?: 'small' | 'medium' | 'large';
  showLabel?: boolean;
  variant?: 'default' | 'betweener';
  surface?: 'default' | 'explore';
  onPress?: () => void;
  style?: any;
  rejectionStatus?: {
    isRejected: boolean;
    rejectionReason?: string;
    canResubmit?: boolean;
  };
}

export const VerificationBadge: React.FC<VerificationBadgeProps> = ({
  level = 0,
  size = 'medium',
  showLabel = false,
  variant = 'default',
  surface = 'default',
  onPress,
  style,
  rejectionStatus,
}) => {
  const getBadgeConfig = (verificationLevel: number) => {
    // If there's a rejection, show rejection state regardless of level
    if (rejectionStatus?.isRejected) {
      return {
        level: -1,
        label: 'Rejected',
        color: '#f44336',
        icon: 'close-circle',
        bgColor: '#ffebee',
      };
    }

    if (verificationLevel >= 2) {
      return {
        level: 2,
        label: 'ID Verified',
        color: '#7A5A00',
        icon: 'shield-checkmark',
        bgColor: '#FFF4D6',
        borderColor: '#F0D18A',
      };
    }

    if (verificationLevel === 1) {
      return {
        level: 1,
        label: 'Phone Verified',
        color: '#0F766E',
        icon: 'checkmark-circle',
        bgColor: '#E7F6F4',
        borderColor: '#9FDAD5',
      };
    }

    return {
      level: 0,
      label: 'Unverified',
      color: '#9E9E9E',
      icon: 'help-circle-outline',
      bgColor: '#f5f5f5',
      borderColor: '#e2e2e2',
    };
  };

  const getSizeConfig = (badgeSize: string) => {
    const sizes = {
      small: { iconSize: 16, fontSize: 10, padding: 4, borderRadius: 8 },
      medium: { iconSize: 20, fontSize: 12, padding: 6, borderRadius: 10 },
      large: { iconSize: 24, fontSize: 14, padding: 8, borderRadius: 12 },
    };
    return sizes[badgeSize as keyof typeof sizes] || sizes.medium;
  };

  const badge = getBadgeConfig(level);
  const sizeConfig = getSizeConfig(size);
  const isBetweenerVerified = variant === 'betweener' && !rejectionStatus?.isRejected && level >= 1;
  const isIdVerified = level >= 2;
  const isExploreSurface = isBetweenerVerified && surface === 'explore';
  const betweenerSizing =
    size === 'small'
      ? isExploreSurface
        ? { width: 28, height: 28, borderRadius: 14, iconSize: 13, accentSize: 4.5, accentOffset: 3 }
        : isIdVerified
          ? { width: 25, height: 25, borderRadius: 12.5, iconSize: 12, accentSize: 4, accentOffset: 2.5 }
          : { width: 24, height: 24, borderRadius: 12, iconSize: 11, accentSize: 4, accentOffset: 2.5 }
      : size === 'large'
      ? isIdVerified
        ? { width: 36, height: 36, borderRadius: 18, iconSize: 17, accentSize: 6, accentOffset: 4 }
        : { width: 33, height: 33, borderRadius: 16.5, iconSize: 16, accentSize: 5.5, accentOffset: 4 }
      : isIdVerified
        ? { width: 28, height: 28, borderRadius: 14, iconSize: 13, accentSize: 4.5, accentOffset: 3 }
        : { width: 26, height: 26, borderRadius: 13, iconSize: 12, accentSize: 4, accentOffset: 3 };

  const BadgeContent = () => (
    <View style={[
      styles.badge,
      isBetweenerVerified
        ? [
            isIdVerified
              ? isExploreSurface
                ? styles.betweenerBadgeExplore
                : styles.betweenerBadge
              : isExploreSurface
                ? styles.betweenerPhoneBadgeExplore
                : styles.betweenerPhoneBadge,
            {
              width: betweenerSizing.width,
              height: betweenerSizing.height,
              borderRadius: betweenerSizing.borderRadius,
            },
          ]
        : {
            backgroundColor: badge.bgColor,
            borderColor: badge.borderColor || 'transparent',
            padding: sizeConfig.padding,
            borderRadius: sizeConfig.borderRadius,
          },
      style,
    ]}>
      {isBetweenerVerified ? (
        <>
          <View
            style={[
              styles.betweenerBadgeInner,
              isExploreSurface && styles.betweenerBadgeInnerExplore,
              !isIdVerified && styles.betweenerPhoneBadgeInner,
              !isIdVerified && isExploreSurface && styles.betweenerPhoneBadgeInnerExplore,
            ]}
          >
            <Ionicons
              name={isIdVerified ? 'shield-checkmark' : 'call'}
              size={betweenerSizing.iconSize}
              color={
                isIdVerified
                  ? isExploreSurface
                    ? '#F4DE97'
                    : '#F7E3A1'
                  : isExploreSurface
                    ? '#DFFFFC'
                    : '#FFFFFF'
              }
            />
          </View>
          <View
            style={[
              styles.betweenerBadgeAccent,
              isExploreSurface && styles.betweenerBadgeAccentExplore,
              {
                right: betweenerSizing.accentOffset,
                top: betweenerSizing.accentOffset,
                width: betweenerSizing.accentSize,
                height: betweenerSizing.accentSize,
                borderRadius: betweenerSizing.accentSize / 2,
              },
            ]}
          />
        </>
      ) : (
        <Ionicons 
          name={badge.icon as any} 
          size={sizeConfig.iconSize} 
          color={badge.color} 
        />
      )}
      {showLabel && (
        <Text style={[
          styles.label, 
          { 
            fontSize: sizeConfig.fontSize, 
            color: badge.color,
            marginLeft: 4,
          }
        ]}>
          {badge.label}
        </Text>
      )}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress}>
        <BadgeContent />
      </TouchableOpacity>
    );
  }

  return <BadgeContent />;
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  betweenerBadge: {
    backgroundColor: '#F6E2A6',
    borderWidth: 1.5,
    borderColor: '#D1B160',
    shadowColor: '#0E7C7B',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 4,
  },
  betweenerBadgeExplore: {
    backgroundColor: 'rgba(8, 18, 24, 0.84)',
    borderWidth: 0.8,
    borderColor: 'rgba(244, 222, 151, 0.46)',
    shadowColor: '#050C10',
    shadowOffset: { width: 0, height: 9 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 5,
  },
  betweenerPhoneBadge: {
    backgroundColor: 'rgba(231,246,244,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(159,218,213,0.88)',
    shadowColor: '#0F766E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius: 8,
    elevation: 3,
  },
  betweenerPhoneBadgeExplore: {
    backgroundColor: 'rgba(7, 30, 34, 0.72)',
    borderWidth: 0.8,
    borderColor: 'rgba(19,168,168,0.32)',
    shadowColor: '#050C10',
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 4,
  },
  betweenerBadgeInner: {
    width: '76%',
    height: '76%',
    borderRadius: 999,
    backgroundColor: '#102F2E',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  betweenerBadgeInnerExplore: {
    width: '78%',
    height: '78%',
    backgroundColor: '#123938',
    borderColor: 'rgba(255,255,255,0.12)',
  },
  betweenerPhoneBadgeInner: {
    width: '72%',
    height: '72%',
    backgroundColor: '#0F766E',
    borderColor: 'rgba(255,255,255,0.30)',
  },
  betweenerPhoneBadgeInnerExplore: {
    width: '74%',
    height: '74%',
    backgroundColor: '#0F4F50',
    borderColor: 'rgba(255,255,255,0.14)',
  },
  betweenerBadgeAccent: {
    position: 'absolute',
    right: 3,
    top: 3,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#12B5B0',
    borderWidth: 1,
    borderColor: '#F9F4E3',
  },
  betweenerBadgeAccentExplore: {
    backgroundColor: '#2BDBD5',
    borderColor: '#081317',
  },
  label: {
    fontWeight: '600',
  },
});
