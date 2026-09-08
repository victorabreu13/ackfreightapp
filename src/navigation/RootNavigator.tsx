import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React from "react";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "../context/AuthContext";
import AdminDashboardScreen from "../screens/AdminDashboardScreen";
import DriverHomeScreen from "../screens/DriverHomeScreen";
import LoginScreen from "../screens/LoginScreen";
import NewTripScreen from "../screens/NewTripScreen";
import SignUpScreen from "../screens/SignUpScreen";
import TripDetailScreen from "../screens/TripDetailScreen";

const Stack = createNativeStackNavigator();

export default function RootNavigator() {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!user || !profile) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="SignUp" component={SignUpScreen} />
      </Stack.Navigator>
    );
  }

  if (profile.role === "admin") {
    return (
      <Stack.Navigator>
        <Stack.Screen
          name="AdminDashboard"
          component={AdminDashboardScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="TripDetail"
          component={TripDetailScreen}
          options={{ title: "Trip Detail" }}
        />
      </Stack.Navigator>
    );
  }

  return (
    <Stack.Navigator>
      <Stack.Screen
        name="DriverHome"
        component={DriverHomeScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="NewTrip"
        component={NewTripScreen}
        options={{ title: "Log New Trip" }}
      />
      <Stack.Screen
        name="TripDetail"
        component={TripDetailScreen}
        options={{ title: "Trip Detail" }}
      />
    </Stack.Navigator>
  );
}
