/**
 * Exit message utility - Fetches and displays random exit messages
 */

import { getLastMessage, saveLastMessage } from "./message-cache";

interface ExitMessage {
  message: string;
  author?: string;
}

interface ExitMessagesData {
  messages: ExitMessage[];
}

const EXIT_MESSAGES_URL = "https://cdn.catman6112.dev/rtvs-exit.json";
const FALLBACK_MESSAGES = [
  { message: "Ain't over till it's over." },
  { message: "PILOT EJECTING." },
  { message: "Falling.. With You?" },
];

// Preloaded exit message, loaded at startup
let preloadedExitMessage: string | null = null;
let usedFallback: boolean = false;

/**
 * Select a random message different from the last one
 */
function selectRandomMessage(messages: ExitMessage[], lastMessage: string | null): string {
  // If we only have one message, just return it
  if (messages.length === 1) {
    const msg = messages[0];
    return msg.author ? `${msg.message} - ${msg.author}` : msg.message;
  }

  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    const randomMessage = messages[Math.floor(Math.random() * messages.length)];
    const formattedMessage = randomMessage.author
      ? `${randomMessage.message} - ${randomMessage.author}`
      : randomMessage.message;

    // If this message is different from the last one, use it
    if (formattedMessage !== lastMessage) {
      return formattedMessage;
    }

    attempts++;
  }

  // If we couldn't find a different message after max attempts, just return a random one
  const randomMessage = messages[Math.floor(Math.random() * messages.length)];
  return randomMessage.author
    ? `${randomMessage.message} - ${randomMessage.author}`
    : randomMessage.message;
}

/**
 * Preload a random exit message at startup
 * This ensures the message is ready immediately when the server exits
 */
export async function preloadExitMessage(): Promise<void> {
  try {
    // Get the last used message
    const lastMessage = await getLastMessage();

    const response = await fetch(EXIT_MESSAGES_URL, {
      signal: AbortSignal.timeout(4000), // 4 second timeout
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json() as ExitMessagesData;

    if (!data.messages || !Array.isArray(data.messages) || data.messages.length === 0) {
      throw new Error("Invalid data format");
    }

    // Select a message different from the last one
    preloadedExitMessage = selectRandomMessage(data.messages, lastMessage);
    usedFallback = false;
  } catch (error: any) {
    // Fall back to local messages if fetch fails
    const lastMessage = await getLastMessage();
    preloadedExitMessage = selectRandomMessage(FALLBACK_MESSAGES, lastMessage);
    usedFallback = true;
  }
}

/**
 * Get the preloaded exit message (synchronous) and save it to cache
 * Returns a fallback if preloading failed or hasn't completed
 */
export function getPreloadedExitMessage(): string {
  if (preloadedExitMessage) {
    // Save this message to cache (fire and forget)
    saveLastMessage(preloadedExitMessage).catch(() => {
      // Silently fail if we can't save
    });

    // Append error indicator if we used fallback
    if (usedFallback) {
      return `${preloadedExitMessage} (error while getting exit message.)`;
    }
    return preloadedExitMessage;
  }
  // Fallback if preloading hasn't completed yet
  const fallback = FALLBACK_MESSAGES[Math.floor(Math.random() * FALLBACK_MESSAGES.length)];
  return `${fallback.message} (error while getting exit message.)`;
}

/**
 * Fetches a random exit message from the CDN
 * Falls back to local messages if fetch fails
 * @deprecated Use preloadExitMessage() at startup and getPreloadedExitMessage() instead
 */
export async function getRandomExitMessage(): Promise<string> {
  try {
    const response = await fetch(EXIT_MESSAGES_URL, {
      signal: AbortSignal.timeout(2000), // 2 second timeout
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json() as ExitMessagesData;

    if (!data.messages || !Array.isArray(data.messages) || data.messages.length === 0) {
      throw new Error("Invalid data format");
    }

    // Pick a random message
    const randomMessage = data.messages[Math.floor(Math.random() * data.messages.length)];

    // Format the message
    if (randomMessage.author) {
      return `${randomMessage.message} - ${randomMessage.author}`;
    }
    return randomMessage.message;
  } catch (error) {
    // Fallback to local messages if fetch fails
    const fallback = FALLBACK_MESSAGES[Math.floor(Math.random() * FALLBACK_MESSAGES.length)];
    return fallback.message;
  }
}

/**
 * Displays a random exit message to the console
 */
export async function displayExitMessage(): Promise<void> {
  const message = await getRandomExitMessage();
  console.log(message);
}
