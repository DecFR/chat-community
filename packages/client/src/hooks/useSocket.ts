import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../stores/authStore';

let socketInstance: Socket | null = null;

export const useSocket = () => {
  const { token } = useAuthStore.getState();
  const [socket, setSocket] = useState<Socket | null>(socketInstance);

  useEffect(() => {
    if (token && !socketInstance) {
      const newSocket = io(import.meta.env.VITE_API_URL, {
        auth: {
          token: `${token}`,
        },
      });

      newSocket.on('connect', () => {
        console.log('Socket connected:', newSocket.id);
        socketInstance = newSocket;
        setSocket(newSocket);
      });

      newSocket.on('disconnect', () => {
        console.log('Socket disconnected');
        socketInstance = null;
        setSocket(null);
      });

      newSocket.on('connect_error', (err) => {
        console.error('Socket connection error:', err.message);
      });

      return () => {
        newSocket.disconnect();
        socketInstance = null;
      };
    } else if (!token && socketInstance) {
      socketInstance.disconnect();
      socketInstance = null;
      setSocket(null);
    }
  }, [token]);

  return socket;
};
