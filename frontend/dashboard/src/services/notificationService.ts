/**
 * Notification Service
 * Manages toast notifications and alert notifications
 */

export type NotificationSeverity = 'success' | 'info' | 'warning' | 'error';

export interface Notification {
  id: string;
  message: string;
  severity: NotificationSeverity;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

type NotificationListener = (notification: Notification) => void;

class NotificationService {
  private listeners: NotificationListener[] = [];
  private notificationId = 0;

  /**
   * Subscribe to notifications
   */
  subscribe(listener: NotificationListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  /**
   * Show a notification
   */
  show(notification: Omit<Notification, 'id'>): void {
    const fullNotification: Notification = {
      id: `notification-${++this.notificationId}`,
      duration: 6000,
      ...notification,
    };
    
    this.listeners.forEach(listener => listener(fullNotification));
  }

  /**
   * Convenience methods
   */
  success(message: string, duration?: number): void {
    this.show({ message, severity: 'success', duration });
  }

  info(message: string, duration?: number): void {
    this.show({ message, severity: 'info', duration });
  }

  warning(message: string, duration?: number): void {
    this.show({ message, severity: 'warning', duration });
  }

  error(message: string, duration?: number): void {
    this.show({ message, severity: 'error', duration });
  }
}

export const notificationService = new NotificationService();

