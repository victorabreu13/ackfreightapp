import { NavigationContainer } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { AuthProvider } from "./src/context/AuthContext";
import RootNavigator from "./src/navigation/RootNavigator";

// Gives the web build real URL/history integration so the browser's own
// back/forward buttons work, instead of only the on-screen back buttons.
const linking = {
  prefixes: [],
  config: {
    screens: {
      Login: "login",
      SignUp: "signup",
      AdminDashboard: "dashboard",
      DriverHome: "home",
      NewTrip: "new-trip",
      TripDetail: "trip",
      DriversRecord: "drivers-record",
      CustomerHome: "customer-home",
      NewTripRequest: "new-trip-request",
      TripRequestDetail: "trip-request",
      Dispatch: "dispatch",
      DispatchDetail: "dispatch-request",
    },
  },
};

export default function App() {
  return (
    <AuthProvider>
      <NavigationContainer linking={linking}>
        <StatusBar style="dark" />
        <RootNavigator />
      </NavigationContainer>
    </AuthProvider>
  );
}
