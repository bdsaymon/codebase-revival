export interface HomeGreetingOptions {
  date?: Date;
  name?: string | null;
  isEnglish?: boolean;
}

export interface HomeGreetingResult {
  headline: string;
  subtitle: string;
  placeholder: string;
}

/**
 * Generates an English timezone-aware greeting using the user's local clock.
 * Always places the user's name at the end when configured, with "I can help you."
 * as the subtitle beneath the headline.
 */
export function getTimeOfDayGreeting(
  options: HomeGreetingOptions = {}
): HomeGreetingResult {
  const date = options.date ?? new Date();
  const cleanName = (options.name || '').trim();
  const hour = date.getHours();

  let greeting = 'Good Night';
  if (hour >= 5 && hour < 12) {
    greeting = 'Good Morning';
  } else if (hour >= 12 && hour < 17) {
    greeting = 'Good Afternoon';
  } else if (hour >= 17 && hour < 21) {
    greeting = 'Good Evening';
  }

  return {
    headline: cleanName ? `${greeting}, ${cleanName}` : greeting,
    subtitle: 'I can help you.',
    placeholder: 'How can I help you today?',
  };
}
