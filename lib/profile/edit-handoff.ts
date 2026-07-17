let pendingOpenProfileEditRequest = false;

export const requestOpenProfileEdit = () => {
  pendingOpenProfileEditRequest = true;
};

export const consumeOpenProfileEditRequest = () => {
  if (!pendingOpenProfileEditRequest) return false;
  pendingOpenProfileEditRequest = false;
  return true;
};
