/**
 * Direct mounting point for the reference-matched Claude-style Settings page.
 *
 * Usage inside the existing app (e.g. from App.tsx or the settings view):
 *
 *   import ClaudeStyleSettings from './components/ClaudeStyleSettings';
 *   <ClaudeStyleSettings
 *     planLabel="Free"
 *     capabilitiesEnabled={enabledToolCount}
 *     colorModeValue={settings.theme === 'dark' ? 'Dark' : 'Light'}
 *     fontStyleValue="Default"
 *     hapticDefault={settings.hapticFeedback !== false}
 *     onMenu={() => setSidebarOpen(true)}
 *     onInfo={() => setInfoModal('stats')}
 *     onUpgrade={() => setSettingsTab('billing')}
 *     onNavigate={(section) => setSettingsTab(section)}
 *   />
 *
 * The props above are optional; with no props it renders exactly like the
 * reference screenshot and the toggle still works as real state.
 */
export { default, type ClaudeStyleSettingsProps, type SettingsSectionId } from './ClaudeStyleSettings';
