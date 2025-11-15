import { Role, UserStatus } from '@prisma/client';
import { NextFunction, Request, Response } from 'express';
import passport from 'passport';
import { ExtractJwt, Strategy as JwtStrategy, StrategyOptions } from 'passport-jwt';

import prisma from '../utils/prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

const jwtOptions: StrategyOptions = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: JWT_SECRET,
};

type AuthenticatedUser = {
  id: string;
  username: string;
  email: string | null;
  role: Role;
  avatarUrl: string | null;
  bio: string | null;
  status: UserStatus;
};

passport.use(
  new JwtStrategy(jwtOptions, async (payload: { id: string }, done) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: payload.id },
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          avatarUrl: true,
          bio: true,
          status: true,
        },
      });

      if (user) {
        return done(null, user);
      }
      return done(null, false);
    } catch (error) {
      return done(error, false);
    }
  })
);

export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  passport.authenticate(
    'jwt',
    { session: false },
    (err: Error | null, user: AuthenticatedUser | false) => {
      if (err || !user) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized',
        });
      }
      req.user = user;
      return next();
    }
  )(req, res, next);
};

export const adminMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user || req.user.role !== 'ADMIN') {
    return res.status(403).json({
      success: false,
      error: 'Forbidden: Admin access required',
    });
  }
  next();
};

export default passport;
