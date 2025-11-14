import { create } from 'zustand';
import { friendAPI } from '../lib/api';

interface Friend {
  id: string;
  username: string;
  avatarUrl?: string;
  status: string;
  bio?: string;
  friendshipId: string;
}

interface FriendRequest {
  id: string;
  sender: {
    id: string;
    username: string;
    avatarUrl?: string;
    status: string;
    bio?: string;
  };
  createdAt: string;
}

interface FriendState {
  friends: Friend[];
  pendingRequests: FriendRequest[];
  isLoading: boolean;
  loadFriends: () => Promise<void>;
  loadPendingRequests: () => Promise<void>;
  sendFriendRequest: (receiverId: string) => Promise<void>;
  acceptRequest: (friendshipId: string) => Promise<void>;
  declineRequest: (friendshipId: string) => Promise<void>;
  removeFriend: (friendshipId: string) => Promise<void>;
  updateFriendStatus: (userId: string, status: string) => void;
}

export const useFriendStore = create<FriendState>((set) => ({
  friends: [],
  pendingRequests: [],
  isLoading: false,

  loadFriends: async () => {
    try {
      set({ isLoading: true });
      const response = await friendAPI.getFriends();
      const friends = response.data.data;
      set({ friends, isLoading: false });
    } catch (error) {
      console.error('Failed to load friends:', error);
      set({ isLoading: false });
    }
  },

  loadPendingRequests: async () => {
    try {
      const response = await friendAPI.getPendingRequests();
      const pendingRequests = response.data.data;
      set({ pendingRequests });
    } catch (error) {
      console.error('Failed to load pending requests:', error);
    }
  },

  sendFriendRequest: async (receiverId) => {
    try {
      await friendAPI.sendRequest(receiverId);
    } catch (error) {
      console.error('Failed to send friend request:', error);
      throw error;
    }
  },

  acceptRequest: async (friendshipId) => {
    try {
      await friendAPI.acceptRequest(friendshipId);
      set((state) => ({
        pendingRequests: state.pendingRequests.filter((req) => req.id !== friendshipId),
      }));
      // 重新加载好友列表
      const response = await friendAPI.getFriends();
      set({ friends: response.data.data });
    } catch (error) {
      console.error('Failed to accept request:', error);
      throw error;
    }
  },

  declineRequest: async (friendshipId) => {
    try {
      await friendAPI.declineRequest(friendshipId);
      set((state) => ({
        pendingRequests: state.pendingRequests.filter((req) => req.id !== friendshipId),
      }));
    } catch (error) {
      console.error('Failed to decline request:', error);
      throw error;
    }
  },

  removeFriend: async (friendshipId) => {
    try {
      await friendAPI.removeFriend(friendshipId);
      set((state) => ({
        friends: state.friends.filter((friend) => friend.friendshipId !== friendshipId),
      }));
    } catch (error) {
      console.error('Failed to remove friend:', error);
      throw error;
    }
  },

  updateFriendStatus: (userId, status) => {
    set((state) => ({
      friends: state.friends.map((friend) =>
        friend.id === userId ? { ...friend, status } : friend
      ),
    }));
  },
}));
