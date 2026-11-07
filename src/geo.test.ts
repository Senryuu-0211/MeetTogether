import { describe, expect, it } from 'vitest';
import { haversine, rank, shortlist } from './geo';

const BEN_THANH = { lat: 10.7725, lng: 106.698 };

describe('haversine', () => {
  it('1 độ vĩ ≈ 111.2 km', () => {
    expect(haversine({ lat: 10, lng: 106 }, { lat: 11, lng: 106 })).toBeCloseTo(111195, -2);
  });
  it('cùng điểm = 0', () => {
    expect(haversine(BEN_THANH, BEN_THANH)).toBe(0);
  });
});

describe('rank', () => {
  const a = { id: 'a', times: [10, 10, 40] }; // tổng 60, max 40
  const b = { id: 'b', times: [22, 22, 22] }; // tổng 66, max 22
  const c = { id: 'c', times: [20, 20, 26] }; // tổng 66, max 26

  it('total: tổng nhỏ nhất trước, hoà xét max', () => {
    expect(rank([b, c, a], 'total').map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });
  it('fair: đi bằng nhau trước', () => {
    expect(rank([a, c, b], 'fair').map((x) => x.id)).toEqual(['b', 'c', 'a']);
  });
  it('fair: 18/18/14 thắng 17/17/7 (một người đi quá gần)', () => {
    const uneven = { id: 'uneven', times: [17, 17, 7] };
    const even = { id: 'even', times: [18, 18, 14] };
    expect(rank([uneven, even], 'fair')[0].id).toBe('even');
  });
  it('fair: không chọn chỗ xa chỉ vì ai cũng đi lâu như nhau', () => {
    const far = { id: 'far', times: [30, 30, 30] };
    const near = { id: 'near', times: [17, 17, 7] };
    expect(rank([far, near], 'fair')[0].id).toBe('near');
  });
  it('không sửa mảng gốc', () => {
    const items = [b, a];
    rank(items, 'total');
    expect(items.map((x) => x.id)).toEqual(['b', 'a']);
  });
});

describe('shortlist', () => {
  // Người 3 nằm gần đường nối hai người kia → trung vị hình học trùng người 3.
  // Cách cũ chỉ tìm trong bán kính ≤ 3 km quanh trung vị nên bỏ sót quán "ở giữa" cách đó ~3.9 km.
  const people = [
    { lat: 10.8, lng: 106.5 },
    { lat: 10.8, lng: 106.9 },
    { lat: 10.765, lng: 106.7 },
  ];
  const nearPerson3 = { name: 'gần người 3', lat: 10.766, lng: 106.7 };
  const middle = { name: 'ở giữa', lat: 10.8, lng: 106.7 };

  it('fair: tìm được quán tốt nhất dù cách người 3 hơn 3 km', () => {
    expect(haversine(middle, people[2])).toBeGreaterThan(3000);
    expect(shortlist([nearPerson3, middle], people, 'fair', 1)[0].name).toBe('ở giữa');
  });

  it('giữ tối đa n phần tử, trả về object gốc', () => {
    const out = shortlist([nearPerson3, middle], people, 'total', 5);
    expect(out).toHaveLength(2);
    expect(out).toContain(nearPerson3);
  });
});
