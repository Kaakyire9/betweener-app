type RpcClient = {
  rpc: (functionName: string) => PromiseLike<{ data: unknown; error: unknown }>;
};

export const isLiveProductEnabled = async (client: RpcClient): Promise<boolean> => {
  try {
    const { data, error } = await client.rpc('rpc_get_live_product_availability_v1');
    return !error && data === true;
  } catch {
    return false;
  }
};
