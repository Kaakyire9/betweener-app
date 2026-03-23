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
  const isBetweenerVerified = variant === 'betweener' && !rejectionStatus?.isRejected && level >= 2;
  const isExploreSurface = isBetweenerVerified && surface === 'explore';
  const betweenerSizing =
    size === 'small'
      ? isExploreSurface
        ? { width: 35, height: 35, borderRadius: 17.5, iconSize: 16, accentSize: 6, accentOffset: 4 }
        : { width: 31, height: 31, borderRadius: 15.5, iconSize: 15, accentSize: 6, accentOffset: 3 }
      : size === 'large'
      ? { width: 40, height: 40, borderRadius: 20, iconSize: 20, accentSize: 7, accentOffset: 4 }
      : { width: 35, height: 35, borderRadius: 17.5, iconSize: 17, accentSize: 6, accentOffset: 3 };

  const BadgeContent = () => (
    <View style={[
      styles.badge,
      isBetweenerVerified
        ? [
            isExploreSurface ? styles.betweenerBadgeExplore : styles.betweenerBadge,
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
          <View style={[styles.betweenerBadgeInner, isExploreSurface && styles.betweenerBadgeInnerExplore]}>
            <Ionicons
              name="shield-checkmark"
              size={betweenerSizing.iconSize}
              color={isExploreSurface ? '#F4DE97' : '#F7E3A1'}
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
