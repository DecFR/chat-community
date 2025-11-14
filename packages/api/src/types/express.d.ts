declare namespace Express {
  export interface Request {
    user?: {
      id: string;
      username: string;
      email?: string | null;
      role: string;
      avatarUrl?: string | null;
      bio?: string | null;
      status: string;
    };
  }
}
