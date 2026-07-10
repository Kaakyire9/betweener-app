import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Animated, Text, TextInput, TouchableOpacity, View } from "react-native";

type HeaderTheme = {
  tint: string;
  textMuted: string;
};

type ChatListHeaderProps = {
  showSearch: boolean;
  searchAnimation: Animated.Value;
  searchQuery: string;
  onToggleSearch: () => void;
  showDiagnosticsButton?: boolean;
  onOpenDiagnostics?: () => void;
  onChangeSearchQuery: (value: string) => void;
  onClearSearch: () => void;
  activeTab: 'all' | 'unread' | 'pinned' | 'archived';
  onChangeTab: (tab: 'all' | 'unread' | 'pinned' | 'archived') => void;
  unreadConversationCount: number;
  archivedConversationCount: number;
  styles: Record<string, any>;
  theme: HeaderTheme;
};

export function ChatListHeader({
  showSearch,
  searchAnimation,
  searchQuery,
  onToggleSearch,
  showDiagnosticsButton = false,
  onOpenDiagnostics,
  onChangeSearchQuery,
  onClearSearch,
  activeTab,
  onChangeTab,
  unreadConversationCount,
  archivedConversationCount,
  styles,
  theme,
}: ChatListHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.headerTop}>
        <Text style={styles.headerTitle}>Messages</Text>
        <View style={styles.headerActions}>
          {showDiagnosticsButton && onOpenDiagnostics ? (
            <TouchableOpacity style={styles.headerButton} onPress={onOpenDiagnostics}>
              <MaterialCommunityIcons
                name="database-search-outline"
                size={22}
                color={theme.tint}
              />
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={styles.headerButton} onPress={onToggleSearch}>
            <MaterialCommunityIcons
              name={showSearch ? "close" : "magnify"}
              size={24}
              color={theme.tint}
            />
          </TouchableOpacity>
        </View>
      </View>

      {!showSearch ? (
        <TouchableOpacity
          activeOpacity={0.78}
          style={styles.searchShortcut}
          onPress={onToggleSearch}
        >
          <MaterialCommunityIcons name="magnify" size={19} color={theme.textMuted} />
          <Text style={styles.searchShortcutText} numberOfLines={1}>
            {searchQuery.trim() ? searchQuery.trim() : 'Search messages'}
          </Text>
          <View style={styles.searchShortcutKeyline}>
            <MaterialCommunityIcons name="star-four-points" size={13} color={theme.tint} />
          </View>
        </TouchableOpacity>
      ) : null}

      <Animated.View
        style={[
          styles.searchContainer,
          {
            height: searchAnimation.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 50],
            }),
            opacity: searchAnimation,
          },
        ]}
      >
        <View style={styles.searchInputContainer}>
          <MaterialCommunityIcons name="magnify" size={20} color={theme.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search conversations..."
            placeholderTextColor={theme.textMuted}
            value={searchQuery}
            onChangeText={onChangeSearchQuery}
            autoFocus={showSearch}
          />
          {searchQuery.length > 0 ? (
            <TouchableOpacity onPress={onClearSearch}>
              <MaterialCommunityIcons name="close-circle" size={20} color={theme.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
      </Animated.View>

      <View style={styles.filterTabs}>
        {(['all', 'unread', 'pinned', 'archived'] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.filterTab, activeTab === tab && styles.activeFilterTab]}
            onPress={() => onChangeTab(tab)}
          >
            <Text style={[styles.filterTabText, activeTab === tab && styles.activeFilterTabText]}>
              {tab === 'all' ? 'All' : tab === 'unread' ? 'Unread' : tab === 'pinned' ? 'Pinned' : 'Archived'}
              {tab === 'unread' && unreadConversationCount > 0 ? (
                <Text style={styles.tabBadge}>{' '}({unreadConversationCount})</Text>
              ) : null}
              {tab === 'archived' && archivedConversationCount > 0 ? (
                <Text style={styles.tabBadge}>{' '}({archivedConversationCount})</Text>
              ) : null}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}
