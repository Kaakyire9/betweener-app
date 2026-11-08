export type AuthRecoveryGenerationToken = {
  generation: number;
  expectedUserId: string | null;
};

export const createAuthRecoveryGeneration = () => {
  let generation = 0;
  let currentUserId: string | null = null;

  return {
    begin(expectedUserId: string | null): AuthRecoveryGenerationToken {
      return { generation, expectedUserId };
    },

    invalidate(nextUserId: string | null) {
      generation += 1;
      currentUserId = nextUserId;
      return generation;
    },

    isCurrent(token: AuthRecoveryGenerationToken) {
      if (token.generation !== generation) return false;
      if (
        token.expectedUserId &&
        currentUserId &&
        token.expectedUserId !== currentUserId
      ) {
        return false;
      }
      return true;
    },

    getGeneration() {
      return generation;
    },
  };
};
