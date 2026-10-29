import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { subscribeToConversation, subscribeToConversations } from "../services/messages";

/** Unread messages for whoever is signed in: an admin's total across all drivers, or a driver's own. */
export function useUnreadMessages(): number {
  const { user, profile } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user || !profile) return;
    if (profile.role === "admin") {
      return subscribeToConversations(
        (list) => setCount(list.reduce((n, c) => n + (c.unreadForAdmin ?? 0), 0)),
        () => {}
      );
    }
    if (profile.role === "driver") {
      return subscribeToConversation(user.uid, (c) => setCount(c?.unreadForDriver ?? 0));
    }
    setCount(0);
  }, [user, profile?.role]);

  return count;
}
