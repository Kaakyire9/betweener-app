import Constants from 'expo-constants';

import {
  createRelationshipGistLinks,
  type RelationshipGistAppIdentity,
} from './relationship-gist-link-environment';

const getRuntimeIdentity = (): RelationshipGistAppIdentity | null => {
  const identity = Constants.expoConfig?.extra?.appIdentity;
  return identity && typeof identity === 'object'
    ? identity as RelationshipGistAppIdentity
    : null;
};

export const createCurrentRelationshipGistLinks = (
  gistId: string,
  perspective?: string | null,
) => createRelationshipGistLinks(gistId, perspective, getRuntimeIdentity());
