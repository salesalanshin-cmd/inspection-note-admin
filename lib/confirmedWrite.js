// Require an affected row before reporting success or starting dependent writes.
export async function confirmedWrite(mutation, key = 'id', columns = key) {
  const result = await mutation.select(columns).single();
  if (result.error || result.data?.[key] != null) return result;
  return { ...result, error: new Error('처리된 행을 확인하지 못했습니다. 목록을 새로고침해 주세요.') };
}
