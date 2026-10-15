// Back that always does something: when there is no earlier screen (the page
// was opened from a link, a bookmark or after a refresh), go to the role's home.
const HOMES = ["Today", "AdminHome", "CustomerHome", "DriverHome"];

export function goBackOrHome(navigation: any): void {
  if (navigation.canGoBack?.()) {
    navigation.goBack();
    return;
  }
  const names: string[] = navigation.getState?.()?.routeNames ?? [];
  const home = HOMES.find((h) => names.includes(h));
  if (home) navigation.navigate(home);
}
