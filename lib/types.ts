export type RecordType = '버그' | '수정 요청' | '확인 요청';
export const RECORD_TYPES: RecordType[] = ['버그', '수정 요청', '확인 요청'];

export type EvidenceKind = 'element' | 'container' | 'text' | 'region' | 'network' | 'paste';

export const KIND_LABEL: Record<EvidenceKind, string> = {
  element: '요소',
  container: '컨테이너',
  text: '텍스트',
  region: '영역',
  network: '네트워크',
  paste: '붙여넣기',
};

/** 프레임워크 어댑터가 감지한 경우에만 채워지는 보강 정보 */
export interface ComponentInfo {
  framework: string;
  /** 가까운 컴포넌트부터 바깥쪽 순서 */
  chain: string[];
  /** 이 DOM 요소를 만든 JSX 위치. 예: src/components/Card.tsx:42 */
  source?: string;
  /** 소스 위치가 변환된 코드 기준 근사값인지 */
  sourceApprox?: boolean;
}

export interface TableSummary {
  headers: string[];
  visibleRows: number;
}

export interface NetworkEntry {
  method: string;
  url: string;
  status: number;
  durationMs: number;
  size: number;
  bodyPreview: string;
  route: string;
  time: number;
}

export interface RegionChild {
  selector: string;
  tag: string;
  text: string;
}

export interface Evidence {
  /** 기록 건 안에서의 문자(A, B, …). 미분류에서는 비어 있음 */
  letter?: string;
  uid: string;
  kind: EvidenceKind;
  url: string;
  route: string;
  capturedAt: number;
  viewportWidth: number;
  /** 담을 때의 document.title */
  pageTitle?: string;
  note: string;
  /** element / container / text(감싸는 요소) / region 공통 */
  selector?: string;
  tag?: string;
  label?: string;
  text?: string;
  html?: string;
  component?: ComponentInfo;
  table?: TableSummary;
  /** text 전용 */
  quote?: { exact: string; prefix: string; suffix: string };
  /** region 전용 */
  rect?: { x: number; y: number; width: number; height: number };
  children?: RegionChild[];
  /** region 전용: 영역 안에 보이던 글자(화면 순서) */
  regionTexts?: string[];
  /** network 전용 */
  requests?: NetworkEntry[];
  /** paste 전용: 붙여넣은 텍스트 (이미지는 screenshot 필드에) */
  pastedText?: string;
  /** PNG data URL. 파일로 쓸 때 assets/<id>/<letter>.png 로 저장 */
  screenshot?: string;
  /**
   * 페이지 위 마커를 세울 자리. md 에는 쓰지 않는다.
   * element·container·text: 요소 안에서 클릭한 가로 위치(0~1, 마커는 요소 위 테두리에 선다)
   * region: 캡처 때의 페이지 좌표(rect + 스크롤)
   */
  anchor?: { x: number; y: number };
}

export interface BugRecord {
  id: number;
  title: string;
  type: RecordType;
  related: string;
  memo: string;
  created: string;
  /** 마지막으로 파일에 쓴 시각. 처리 기록보다 늦으면 처리 후 내용이 바뀐 것 */
  updated?: string;
  app: string;
  evidence: Evidence[];
}

/** .pinproof/ 폴더를 읽어 얻는 목록용 요약 */
export interface RecordSummary {
  id: number;
  title: string;
  type: string;
  evidenceCount: number;
  created: string;
  fileName: string;
  archived: boolean;
  hasResult: boolean;
  /** 기록을 만든 앱 주소(frontmatter app). 옛 기록처럼 없으면 undefined */
  app?: string;
}
