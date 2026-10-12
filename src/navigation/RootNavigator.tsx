import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React from "react";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "../context/AuthContext";
import AdminDashboardScreen from "../screens/AdminDashboardScreen";
import ClientsScreen from "../screens/ClientsScreen";
import DriversScreen from "../screens/DriversScreen";
import LiveMapScreen from "../screens/LiveMapScreen";
import NewRequestsScreen from "../screens/NewRequestsScreen";
import TodayScreen from "../screens/TodayScreen";
import ToInvoiceScreen from "../screens/ToInvoiceScreen";
import CustomerHomeScreen from "../screens/CustomerHomeScreen";
import CustomerTripRequestsScreen from "../screens/CustomerTripRequestsScreen";
import DispatchDetailScreen from "../screens/DispatchDetailScreen";
import DispatchNewRequestScreen from "../screens/DispatchNewRequestScreen";
import DispatchScreen from "../screens/DispatchScreen";
import DeletedTripsScreen from "../screens/DeletedTripsScreen";
import DriversAvailableScreen from "../screens/DriversAvailableScreen";
import DriverPayrollScreen from "../screens/DriverPayrollScreen";
import ManageUsersScreen from "../screens/ManageUsersScreen";
import DriversLogScreen from "../screens/DriversLogScreen";
import DriversRecordScreen from "../screens/DriversRecordScreen";
import DriverLocationPublisher from "../components/DriverLocationPublisher";
import DriverHomeScreen from "../screens/DriverHomeScreen";
import DriverEarningsScreen from "../screens/DriverEarningsScreen";
import JobBoardScreen from "../screens/JobBoardScreen";
import PayAgreementScreen from "../screens/PayAgreementScreen";
import DriverTripRequestDetailScreen from "../screens/DriverTripRequestDetailScreen";
import LoginScreen from "../screens/LoginScreen";
import MyTripRequestsScreen from "../screens/MyTripRequestsScreen";
import NewTripRequestScreen from "../screens/NewTripRequestScreen";
import NewTripScreen from "../screens/NewTripScreen";
import SignUpScreen from "../screens/SignUpScreen";
import TripDetailScreen from "../screens/TripDetailScreen";
import TripHistoryScreen from "../screens/TripHistoryScreen";
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
        {/* Today is the admin landing screen; the side menu (AdminShell)
            links the other top-level screens. */}
        <Stack.Screen name="Today" component={TodayScreen} options={{ headerShown: false }} />
        <Stack.Screen name="LiveMap" component={LiveMapScreen} options={{ headerShown: false }} />
        <Stack.Screen name="NewRequests" component={NewRequestsScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Drivers" component={DriversScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Clients" component={ClientsScreen} options={{ headerShown: false }} />
        <Stack.Screen name="ToInvoice" component={ToInvoiceScreen} options={{ headerShown: false }} />
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
          name="DriversLog"
          component={DriversLogScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="DriversRecord"
          component={DriversRecordScreen}
          options={{ title: "Drivers Record" }}
        />
        <Stack.Screen
          name="DriverPayroll"
          component={DriverPayrollScreen}
          options={{ title: "Driver Payroll" }}
        />
        <Stack.Screen
          name="Dispatch"
          component={DispatchScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="DispatchDetail"
          component={DispatchDetailScreen}
          options={{ title: "Trip" }}
        />
        <Stack.Screen
          name="DispatchNewRequest"
          component={DispatchNewRequestScreen}
          options={{ title: "New Trip" }}
        />
        <Stack.Screen
          name="DeletedTrips"
          component={DeletedTripsScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="DriversAvailable"
          component={DriversAvailableScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="ManageUsers"
          component={ManageUsersScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="PayAgreement"
          component={PayAgreementScreen}
          options={{ headerShown: false }}
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
          name="CustomerTripRequests"
          component={CustomerTripRequestsScreen}
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
    <>
    <DriverLocationPublisher />
    <Stack.Navigator>
      <Stack.Screen
        name="DriverHome"
        component={DriverHomeScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="JobBoard"
        component={JobBoardScreen}
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
      <Stack.Screen
        name="TripHistory"
        component={TripHistoryScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="DriverEarnings"
        component={DriverEarningsScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
    </>
  );
}
