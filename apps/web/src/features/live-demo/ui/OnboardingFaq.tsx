import { useState } from 'react';
import { cn } from '@/shared/lib/cn';
import { TicketCard } from '@/shared/ui/kit/TicketCard';

const FAQ_ITEMS = [
  {
    q: '캡처한 스크린샷이나 코드 정보가 외부 서버로 전송되나요?',
    a: '아니요. Pinproof 크롬 확장프로그램과 아카이브 스튜디오 웹사이트 모두 100% 로컬 퍼스트로 동작합니다. 기록과 스크린샷은 내 컴퓨터의 프로젝트 폴더(.pinproof/)에만 저장되며 외부 서버나 클라우드로 전송되지 않습니다.',
  },
  {
    q: 'React가 아닌 프로젝트나 스테이징·배포 주소에서도 쓸 수 있나요?',
    a: '네. 요소·영역·텍스트·네트워크 캡처는 프레임워크와 무관하게 동작하며, React(16~19) 앱에서는 컴포넌트 트리와 소스 위치가 자동 보강됩니다. localhost 외 배포 주소도 패널에서 사이트별로 켜서 로컬 프로젝트 폴더에 기록할 수 있습니다.',
  },
  {
    q: 'AI가 여러 항목을 어떤 기준으로 묶었는지 아카이브에서 어떻게 보나요?',
    a: '에이전트가 처리 후 각 항목의 frontmatter(issue, issue_reason) 또는 ## 처리 기록에 남긴 근거와 수정 파일 경로를 아카이브 스튜디오가 자동 파싱해 "사람의 카테고리 → AI 이슈 묶음 기준 매핑" 뷰로 대조해 보여줍니다.',
  },
  {
    q: '아카이브 스튜디오에서 항목을 보관하거나 삭제하면 실제 파일도 바뀌나요?',
    a: '네. 브라우저의 File System Access API로 로컬 프로젝트 폴더를 연결하면 items/ 와 items/archive/ 사이의 실제 .md 파일과 스크린샷(.png)을 직접 이동하거나 영구 삭제합니다. 폴더를 연결하지 않았을 때는 샘플 데이터 모드로 안전하게 체험할 수 있습니다.',
  },
];

export function OnboardingFaq() {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  return (
    <div className="flex flex-col gap-2.5">
      {FAQ_ITEMS.map((item, idx) => {
        const isOpen = openIdx === idx;
        return (
          <TicketCard
            key={item.q}
            className={cn(
              'overflow-hidden transition-colors',
              isOpen && 'border-line-strong',
            )}
          >
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpenIdx(isOpen ? null : idx)}
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left cursor-pointer"
            >
              <span className="text-sm font-semibold text-ink sm:text-base">{item.q}</span>
              <span className="shrink-0 font-mono text-base font-bold text-ink-soft">
                {isOpen ? '×' : '+'}
              </span>
            </button>
            {isOpen && (
              <div className="border-t border-line bg-bg/55 px-5 py-4 text-xs leading-relaxed text-ink-soft sm:text-sm">
                {item.a}
              </div>
            )}
          </TicketCard>
        );
      })}
    </div>
  );
}
