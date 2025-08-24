// src/services/eventBus.ts
// Event bus for cross-component communication and synchronization

export interface EventBusListener<T = any> {
  (data: T): void;
}

export interface EventBusOptions {
  enableLogging?: boolean;
  maxListeners?: number;
}

export class EventBus {
  private listeners: Map<string, Set<EventBusListener>> = new Map();
  private options: EventBusOptions;

  constructor(options: EventBusOptions = {}) {
    this.options = {
      enableLogging: false,
      maxListeners: 100,
      ...options
    };
  }

  // Subscribe to an event
  on<T = any>(event: string, listener: EventBusListener<T>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }

    const eventListeners = this.listeners.get(event)!;
    
    // Check max listeners limit
    if (eventListeners.size >= this.options.maxListeners!) {
      console.warn(`EventBus: Maximum listeners (${this.options.maxListeners}) reached for event '${event}'`);
      return () => {}; // Return no-op unsubscribe function
    }

    eventListeners.add(listener);

    if (this.options.enableLogging) {
      console.log(`📡 EventBus: Listener added for '${event}' (total: ${eventListeners.size})`);
    }

    // Return unsubscribe function
    return () => {
      eventListeners.delete(listener);
      if (eventListeners.size === 0) {
        this.listeners.delete(event);
      }
      if (this.options.enableLogging) {
        console.log(`📡 EventBus: Listener removed for '${event}' (remaining: ${eventListeners.size})`);
      }
    };
  }

  // Subscribe to an event only once
  once<T = any>(event: string, listener: EventBusListener<T>): () => void {
    const onceListener = (data: T) => {
      listener(data);
      unsubscribe();
    };

    const unsubscribe = this.on(event, onceListener);
    return unsubscribe;
  }

  // Emit an event
  emit<T = any>(event: string, data?: T): void {
    const eventListeners = this.listeners.get(event);
    
    if (!eventListeners || eventListeners.size === 0) {
      if (this.options.enableLogging) {
        console.log(`📡 EventBus: No listeners for '${event}'`);
      }
      return;
    }

    if (this.options.enableLogging) {
      console.log(`📡 EventBus: Emitting '${event}' to ${eventListeners.size} listeners`, data);
    }

    // Create a copy of listeners to avoid issues if listeners are modified during emission
    const listenersArray = Array.from(eventListeners);
    
    listenersArray.forEach(listener => {
      try {
        listener(data);
      } catch (error) {
        console.error(`EventBus: Error in listener for '${event}':`, error);
      }
    });
  }

  // Remove all listeners for an event
  off(event: string): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      const count = eventListeners.size;
      this.listeners.delete(event);
      if (this.options.enableLogging) {
        console.log(`📡 EventBus: Removed all ${count} listeners for '${event}'`);
      }
    }
  }

  // Remove all listeners for all events
  clear(): void {
    const totalListeners = Array.from(this.listeners.values())
      .reduce((sum, listeners) => sum + listeners.size, 0);
    
    this.listeners.clear();
    
    if (this.options.enableLogging) {
      console.log(`📡 EventBus: Cleared all ${totalListeners} listeners`);
    }
  }

  // Get listener count for an event
  listenerCount(event: string): number {
    return this.listeners.get(event)?.size || 0;
  }

  // Get all event names
  eventNames(): string[] {
    return Array.from(this.listeners.keys());
  }

  // Check if event has listeners
  hasListeners(event: string): boolean {
    return this.listenerCount(event) > 0;
  }
}

// Sync event constants
export const SYNC_EVENTS = {
  // Timeline synchronization events
  TIMELINE_SEQUENCE_CHANGED: 'timeline:sequence:changed',
  TIMELINE_SCENE_ADDED: 'timeline:scene:added',
  TIMELINE_SCENE_REMOVED: 'timeline:scene:removed',
  TIMELINE_SCENE_UPDATED: 'timeline:scene:updated',
  TIMELINE_CLEARED: 'timeline:cleared',
  
  // Story graph events
  STORY_NODE_ADDED: 'story:node:added',
  STORY_NODE_REMOVED: 'story:node:removed',
  STORY_NODE_UPDATED: 'story:node:updated',
  STORY_GRAPH_CHANGED: 'story:graph:changed',
  
  // Project events
  PROJECT_LOADED: 'project:loaded',
  PROJECT_UPDATED: 'project:updated',
  PROJECT_SCENE_DELETED: 'project:scene:deleted',
  
  // AI processing events
  AI_PROCESSING_STARTED: 'ai:processing:started',
  AI_PROCESSING_COMPLETED: 'ai:processing:completed',
  AI_PROCESSING_FAILED: 'ai:processing:failed',
} as const;

// Create global event bus instance
export const eventBus = new EventBus({
  enableLogging: process.env.NODE_ENV === 'development',
  maxListeners: 200
});

// Export default instance
export default eventBus;
