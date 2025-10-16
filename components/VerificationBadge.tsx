import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface VerificationBadgeProps {
  level: number;
  size?: 'small' | 'medium' | 'large';
  showLabel?: boolean;
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

    const configs = [
      { 
        level: 0, 
        label: 'Unverified', 
        color: '#9E9E9E', 
        icon: 'help-circle-outline',
        bgColor: '#f5f5f5',
      },
      { 
        level: 1, 
        label: 'Basic', 
        color: '#4CAF50', 
        icon: 'checkmark-circle',
        bgColor: '#e8f5e8',
      },
      { 
        level: 2, 
        label: 'Verified', 
        color: '#2196F3', 
        icon: 'shield-checkmark',
        bgColor: '#e3f2fd',
      },
      { 
        level: 3, 
        label: 'Premium', 
        color: '#FF9800', 
        icon: 'star',
        bgColor: '#fff3e0',
      },
    ];
    
    return configs.find(c => c.level === verificationLevel) || configs[0];
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

  const BadgeContent = () => (
    <View style={[
      styles.badge,
      {
        backgroundColor: badge.bgColor,
        padding: sizeConfig.padding,
        borderRadius: sizeConfig.borderRadius,
      },
      style,
    ]}>
      <Ionicons 
        name={badge.icon as any} 
        size={sizeConfig.iconSize} 
        color={badge.color} 
      />
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
  label: {
    fontWeight: '600',
  },
});