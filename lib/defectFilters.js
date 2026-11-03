/**
 * 기간으로 이미 좁힌 불량 기록에 작업자·유형·제품/품번을 AND로 적용한다.
 * 검색어가 비어 있으면 제품 조건은 전체와 같다.
 * 검색어는 product_name 또는 item_id에 포함되면 통과한다(대소문자 무시).
 */
export function filterDefectGallery(records, { worker = 'all', type = 'all', productQuery = '', typeOf }) {
  const query = String(productQuery || '').trim().toLowerCase();
  return (records || []).filter((row) => {
    if (worker !== 'all' && row.worker_name !== worker) return false;
    if (type !== 'all' && typeOf(row) !== type) return false;
    if (!query) return true;
    const name = String(row.product_name || '').toLowerCase();
    const itemId = String(row.item_id || '').toLowerCase();
    return name.includes(query) || itemId.includes(query);
  });
}
