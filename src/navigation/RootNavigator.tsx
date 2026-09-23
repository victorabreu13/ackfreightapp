import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React from "react";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "../context/AuthContext";
import AdminDashboardScreen from "../screens/AdminDashboardScreen";
import CustomerHomeScreen from "../screens/CustomerHomeScreen";
import DispatchDetailScreen from "../screens/DispatchDetailScreen";
import DispatchNewRequestScreen from "../screens/DispatchNewRequestScreen";
import DispatchScreen from "../screens/DispatchScreen";
import DriversRecordScreen from "../screens/DriversRecordScreen";
import DriverHomeScreen from "../screens/DriverHomeScreen";
import DriverTripRequestDetailScreen from "../screens/DriverTripRequestDetailScreen";
import LoginScreen from "../screens/LoginScreen";
import MyTripRequestsScreen from "../screens/MyTripRequestsScreen";
import NewTripRequestScreen from "../screens/NewTripRequestScreen";
import NewTripScreen from "../screens/NewTripScreen";
import SignUpScreen from "../screens/SignUpScreen";
import TripDetailScreen from "../screens/TripDetailScreen";
import TripRequestDetailScreen from "../screens/TripRequestDetailScreen";

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
        <Stack.Screen
          name="DriversRecord"
          component={DriversRecordScreen}
          options={{ title: "Drivers Record" }}
        />
        <Stack.Screen
          name="Dispatch"
          component={DispatchScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="DispatchDetail"
          component={DispatchDetailScreen}
          options={{ title: "Dispatch Request" }}
        />
        <Stack.Screen
          name="DispatchNewRequest"
          component={DispatchNewRequestScreen}
          options={{ title: "New Trip Request" }}
        />
      </Stack.Navigator>
    );
  }

  if (profile.role === "customer") {
    return (
      <Stack.Navigator>
        <Stack.Screen
          name="CustomerHome"
          component={CustomerHomeScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="NewTripRequest"
          component={NewTripRequestScreen}
          options={{ title: "New Trip Request" }}
        />
        <Stack.Screen
          name="TripRequestDetail"
          component={TripRequestDetailScreen}
          options={{ title: "Trip Request" }}
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
      <Stack.Screen
        name="MyTripRequests"
        component={MyTripRequestsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="DriverTripRequestDetail"
        component={DriverTripRequestDetailScreen}
        options={{ title: "Trip Request" }}
      />
    </Stack.Navigator>
  );
}
