import { createNavigationContainerRef } from "@react-navigation/native";

// AppHeader renders as a sibling of NavigationContainer (so it stays visible
// across the whole app, not just inside the screen stack), which means it
// can't use the useNavigation() hook — this ref lets it navigate anyway.
export const navigationRef = createNavigationContainerRef();
