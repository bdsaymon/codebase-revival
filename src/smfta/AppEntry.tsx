import App from "./src/App";
import { initAndroidNativeBridge } from "./src/utils/androidBridge";

let bridgeInitialised = false;

export default function AppEntry() {
  if (!bridgeInitialised && typeof window !== "undefined") {
    bridgeInitialised = true;
    initAndroidNativeBridge();
  }
  return (
    <App />
  );
}
