import App from "./src/App";
import { initAndroidNativeBridge } from "./src/utils/androidBridge";
import { AuthProvider } from "./src/context/AuthContext";

let bridgeInitialised = false;

export default function AppEntry() {
  if (!bridgeInitialised && typeof window !== "undefined") {
    bridgeInitialised = true;
    initAndroidNativeBridge();
  }
  return (
    <AuthProvider>
      <App />
    </AuthProvider>
  );
}
