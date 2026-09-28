import { NavigationContainer } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { Platform, View } from "react-native";
import AppHeader from "./src/components/AppHeader";
import AutoReload from "./src/components/AutoReload";
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
      DriversLog: "drivers-log",
      DriversRecord: "drivers-record",
      DriverPayroll: "driver-payroll",
      CustomerHome: "customer-home",
      CustomerTripRequests: "customer-trip-requests",
      NewTripRequest: "new-trip-request",
      TripRequestDetail: "trip-request",
      Dispatch: "dispatch",
      DispatchDetail: "dispatch-request",
      DispatchNewRequest: "dispatch-new-request",
      MyTripRequests: "my-trip-requests",
      DriverTripRequestDetail: "my-trip-request",
      TripHistory: "trip-history",
    },
  },
};

export default function App() {
  return (
    <AuthProvider>
      <View style={{ flex: 1 }}>
        {Platform.OS === "web" && <AutoReload />}
        {Platform.OS === "web" && <AppHeader />}
        <NavigationContainer linking={linking}>
          <StatusBar style="dark" />
          <RootNavigator />
        </NavigationContainer>
      </View>
    </AuthProvider>
  );
}
