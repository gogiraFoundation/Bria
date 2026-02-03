import React, { useEffect, useState } from 'react';
import { Snackbar, Alert, AlertColor, IconButton } from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import { notificationService, Notification } from '../services/notificationService';

const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notification, setNotification] = useState<Notification | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const unsubscribe = notificationService.subscribe((notif) => {
      setNotification(notif);
      setOpen(true);
    });

    return unsubscribe;
  }, []);

  const handleClose = (event?: React.SyntheticEvent | Event, reason?: string) => {
    if (reason === 'clickaway') {
      return;
    }
    setOpen(false);
  };

  const handleAction = () => {
    if (notification?.action) {
      notification.action.onClick();
      setOpen(false);
    }
  };

  return (
    <>
      {children}
      <Snackbar
        open={open}
        autoHideDuration={notification?.duration || 6000}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Alert
          onClose={handleClose}
          severity={(notification?.severity || 'info') as AlertColor}
          sx={{ width: '100%' }}
          action={
            <>
              {notification?.action && (
                <IconButton
                  size="small"
                  aria-label="action"
                  color="inherit"
                  onClick={handleAction}
                  sx={{ mr: 1 }}
                >
                  {notification.action.label}
                </IconButton>
              )}
              <IconButton
                size="small"
                aria-label="close"
                color="inherit"
                onClick={handleClose}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </>
          }
        >
          {notification?.message}
        </Alert>
      </Snackbar>
    </>
  );
};

export default NotificationProvider;

