import { createContext, useContext, ReactNode } from 'react';

interface MockUser {
  id: string;
  email: string;
}

interface AuthContextType {
  user: MockUser;
  session: null;
  loading: false;
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error: null }>;
  signIn: (email: string, password: string) => Promise<{ error: null }>;
  signOut: () => Promise<void>;
}

const mockUser: MockUser = {
  id: 'local-user',
  email: 'user@nextus.ai',
};

const AuthContext = createContext<AuthContextType>({
  user: mockUser,
  session: null,
  loading: false,
  signUp: async () => ({ error: null }),
  signIn: async () => ({ error: null }),
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const value: AuthContextType = {
    user: mockUser,
    session: null,
    loading: false,
    signUp: async () => ({ error: null }),
    signIn: async () => ({ error: null }),
    signOut: async () => {},
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
