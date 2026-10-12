import React from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useAuth } from "../context/AuthContext";

export interface AdminMenuItem {
  route: string | null; // null = not built yet (shown disabled)
  label: string;
  icon: string;
  note?: string;
}

// The dispatcher's main menu. Order follows the daily workflow.
export const ADMIN_MENU: AdminMenuItem[] = [
  { route: "Today", label: "Today", icon: "📋" },
  { route: "LiveMap", label: "Live Map", icon: "🗺️" },
  { route: "Dispatch", label: "Trips", icon: "🚚" },
  { route: "NewRequests", label: "New Requests", icon: "📥" },
  { route: "Drivers", label: "Drivers", icon: "👷" },
  { route: null, label: "Trucks", icon: "🚛", note: "Phase 2" },
  { route: "Clients", label: "Clients", icon: "🏢" },
  { route: "ToInvoice", label: "To Invoice", icon: "🧾" },
  { route: "AdminDashboard", label: "Settings", icon: "⚙️" },
];

export const WIDE_BREAKPOINT = 900;

interface Props {
  navigation: any;
  active: string;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  badges?: Partial<Record<string, number>>;
  /** Let the child handle its own scrolling (maps, FlatLists). */
  scroll?: boolean;
  children: React.ReactNode;
}

export default function AdminShell({
  navigation,
  active,
  title,
  subtitle,
  right,
  badges = {},
  scroll = true,
  children,
}: Props) {
  const { width } = useWindowDimensions();
  const { signOut, profile } = useAuth();
  const wide = width >= WIDE_BREAKPOINT;

  const go = (route: string | null) => {
    if (!route || route === active) return;
    navigation.navigate(route);
  };

  const header = (
    <View style={[styles.header, !wide && styles.headerNarrow]}>
      <View style={{ flexShrink: 1 }}>
        <Text style={styles.title}>{title}</Text>
        {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
      <View style={styles.headerRight}>{right}</View>
    </View>
  );

  const body = scroll ? (
    <ScrollView contentContainerStyle={[styles.body, !wide && styles.bodyNarrow]}>
      {header}
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.body, !wide && styles.bodyNarrow, { flex: 1 }]}>
      {header}
      {children}
    </View>
  );

  if (wide) {
    return (
      <View style={styles.row}>
        <View style={styles.side}>
          {ADMIN_MENU.map((item) => {
            const on = item.route === active;
            const badge = item.route ? badges[item.route] : undefined;
            return (
              <TouchableOpacity
                key={item.label}
                style={[styles.navItem, on && styles.navItemOn, !item.route && styles.navDisabled]}
                onPress={() => go(item.route)}
                disabled={!item.route}
                accessibilityRole="link"
              >
                <Text style={styles.navIcon}>{item.icon}</Text>
                <Text style={[styles.navLabel, on && styles.navLabelOn]}>{item.label}</Text>
                {!!badge && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{badge}</Text>
                  </View>
                )}
                {!!item.note && <Text style={styles.navNote}>{item.note}</Text>}
              </TouchableOpacity>
            );
          })}
          <View style={{ flex: 1 }} />
          {!!profile?.name && <Text style={styles.who}>{profile.name}</Text>}
          <TouchableOpacity onPress={signOut} style={styles.navItem}>
            <Text style={styles.navIcon}>↩</Text>
            <Text style={styles.navLabel}>Log out</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.content}>{body}</View>
      </View>
    );
  }

  return (
    <View style={styles.content}>
      <View style={[styles.tabsWrap, Platform.OS !== "web" && { paddingTop: 50 }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {ADMIN_MENU.filter((i) => i.route).map((item) => {
            const on = item.route === active;
            const badge = item.route ? badges[item.route] : undefined;
            return (
              <TouchableOpacity
                key={item.label}
                style={[styles.tab, on && styles.tabOn]}
                onPress={() => go(item.route)}
              >
                <Text style={[styles.tabText, on && styles.tabTextOn]}>
                  {item.icon} {item.label}
                  {badge ? ` (${badge})` : ""}
                </Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity style={styles.tab} onPress={signOut}>
            <Text style={styles.tabText}>Log out</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flex: 1, flexDirection: "row", backgroundColor: "#f4f6fa" },
  side: { width: 200, backgroundColor: "#0A1A3A", paddingVertical: 14, paddingHorizontal: 10 },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginBottom: 2,
  },
  navItemOn: { backgroundColor: "#1f3a6e" },
  navDisabled: { opacity: 0.45 },
  navIcon: { width: 20, textAlign: "center", fontSize: 15 },
  navLabel: { color: "#cbd5e1", fontWeight: "600", fontSize: 14 },
  navLabelOn: { color: "#fff" },
  navNote: { marginLeft: "auto", color: "#9db4e0", fontSize: 10, fontWeight: "700" },
  badge: { marginLeft: "auto", backgroundColor: "#dc2626", borderRadius: 10, paddingHorizontal: 7, paddingVertical: 1 },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  who: { color: "#9db4e0", fontSize: 12, paddingHorizontal: 10, marginBottom: 4 },
  content: { flex: 1, backgroundColor: "#f4f6fa" },
  body: { padding: 18, paddingBottom: 40 },
  bodyNarrow: { padding: 12 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 12 },
  headerNarrow: { flexWrap: "wrap" },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  title: { fontSize: 22, fontWeight: "800", color: "#0f172a" },
  subtitle: { fontSize: 13, color: "#64748b", marginTop: 2, fontWeight: "500" },
  tabsWrap: { backgroundColor: "#0A1A3A" },
  tabs: { paddingHorizontal: 8, paddingVertical: 8, gap: 6 },
  tab: { paddingVertical: 7, paddingHorizontal: 11, borderRadius: 16 },
  tabOn: { backgroundColor: "#fff" },
  tabText: { color: "#cbd5e1", fontWeight: "700", fontSize: 13 },
  tabTextOn: { color: "#0A1A3A" },
});
