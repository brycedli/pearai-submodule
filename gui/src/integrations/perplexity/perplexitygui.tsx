import React from "react";
import { ChatBubbleOvalLeftIcon } from "@heroicons/react/24/outline";
import { JSONContent } from "@tiptap/react";
import { InputModifiers } from "core";
import { usePostHog } from "posthog-js/react";
import { XMarkIcon, ClockIcon } from "@heroicons/react/24/outline";
import {
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { ErrorBoundary } from "react-error-boundary";
import { useDispatch, useSelector } from "react-redux";
import { Link, useNavigate } from "react-router-dom";
import { ChatScrollAnchor } from "../../components/ChatScrollAnchor";
import StepContainer from "../../components/gui/StepContainer";
import TimelineItem from "../../components/gui/TimelineItem";
import ContinueInputBox from "../../components/mainInput/ContinueInputBox";
import { defaultInputModifiers } from "../../components/mainInput/inputModifiers";
import { IdeMessengerContext } from "../../context/IdeMessenger";
import useChatHandler from "../../hooks/useChatHandler";
import useHistory from "../../hooks/useHistory";
import { useWebviewListener } from "../../hooks/useWebviewListener";
import { defaultModelSelector } from "../../redux/selectors/modelSelectors";
import {
  clearLastResponse,
  deleteMessage,
  newSession,
  setPerplexityInactive,
} from "../../redux/slices/stateSlice";
import { RootState } from "../../redux/store";
import { getMetaKeyLabel, isMetaEquivalentKeyPressed } from "../../util";
import { FREE_TRIAL_LIMIT_REQUESTS } from "../../util/freeTrial";
import { getLocalStorage, setLocalStorage } from "../../util/localStorage";
import { Badge } from "../../components/ui/badge";
import {
  TopGuiDiv,
  StopButton,
  NewSessionButton,
  fallbackRender,
  StopButtonContainer,
} from "../../pages/gui";
import { CustomTutorialCard } from "@/components/mainInput/CustomTutorialCard";
import { cn } from "@/lib/utils";
import { Citations } from './Citations';
import { Button } from "@/components/ui/button";
import { HistorySidebar } from "@/components/HistorySidebar";
import styled from "styled-components";
import { lightGray } from "@/components";
import InventoryDetails from "../../components/InventoryDetails";


const StepsDiv = styled.div`
  padding-bottom: 8px;
  position: relative;
  background-color: transparent;

  & > * {
    position: relative;
  }

  .thread-message {
    margin: 16px 8px 0 8px;
  }
  .thread-message:not(:first-child) {
    border-top: 1px solid ${lightGray}22;
  }
`;


function PerplexityGUI() {
  const posthog = usePostHog();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const ideMessenger = useContext(IdeMessengerContext);
  const [historySidebarOpen, setHistorySidebarOpen] = useState(false);

  const sessionState = useSelector((state: RootState) => state.state);
  const defaultModel = useSelector(defaultModelSelector);
  const active = useSelector(
    (state: RootState) => state.state.perplexityActive,
  );
  const [stepsOpen, setStepsOpen] = useState<(boolean | undefined)[]>([]);
  const mainTextInputRef = useRef<HTMLInputElement>(null);
  const topGuiDivRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState<boolean>(false);
  const state = useSelector((state: RootState) => state.state);
  // TODO: Remove this later. This is supposed to be set in Onboarding, but
  // many users won't reach onboarding screen due to cache. So set it manually,
  // and on next release we remove it.
  setLocalStorage("showPerplexityTutorialCard", true);
  const [showPerplexityTutorialCard, setShowPerplexityTutorialCard] =
    useState<boolean>(getLocalStorage("showPerplexityTutorialCard"));

  const onCloseTutorialCard = () => {
    posthog.capture("closedPerplexityTutorialCard");
    setLocalStorage("showPerplexityTutorialCard", false);
    setShowPerplexityTutorialCard(false);
  };

  const handleScroll = () => {
    const OFFSET_HERUISTIC = 300;
    if (!topGuiDivRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = topGuiDivRef.current;
    const atBottom =
      scrollHeight - clientHeight <= scrollTop + OFFSET_HERUISTIC;

    setIsAtBottom(atBottom);
  };

  useEffect(() => {
    if (!active || !topGuiDivRef.current) return;

    const scrollAreaElement = topGuiDivRef.current;
    scrollAreaElement.scrollTop =
      scrollAreaElement.scrollHeight - scrollAreaElement.clientHeight;

    setIsAtBottom(true);
  }, [active]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      window.scrollTo({
        top: topGuiDivRef.current?.scrollHeight,
        behavior: "instant" as any,
      });
    }, 1);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener("scroll", handleScroll);
    };
  }, [topGuiDivRef.current]);

  useEffect(() => {
    const listener = (e: any) => {
      if (
        e.key === "Backspace" &&
        isMetaEquivalentKeyPressed(e) &&
        !e.shiftKey
      ) {
        dispatch(setPerplexityInactive());
      } else if (
        e.key === "." &&
        isMetaEquivalentKeyPressed(e) &&
        !e.shiftKey
      ) {
        saveSession();
      }
    };
    window.addEventListener("keydown", listener);

    return () => {
      window.removeEventListener("keydown", listener);
    };
  }, [active]);

  const { streamResponse } = useChatHandler(
    dispatch,
    ideMessenger,
    "perplexity",
  );

  const sendInput = useCallback(
    (editorState: JSONContent, modifiers: InputModifiers) => {
      if (defaultModel?.provider === "free-trial") {
        const u = getLocalStorage("ftc");
        if (u) {
          setLocalStorage("ftc", u + 1);

          if (u >= FREE_TRIAL_LIMIT_REQUESTS) {
            navigate("/onboarding");
            posthog?.capture("ftc_reached");
            return;
          }
        } else {
          setLocalStorage("ftc", 1);
        }
      }

      streamResponse(
        editorState,
        modifiers,
        ideMessenger,
        undefined,
        "perplexity",
      );

      const currentCount = getLocalStorage("mainTextEntryCounter");
      if (currentCount) {
        setLocalStorage("mainTextEntryCounter", currentCount + 1);
      } else {
        setLocalStorage("mainTextEntryCounter", 1);
      }
    },
    [
      sessionState.perplexityHistory,
      sessionState.contextItems,
      defaultModel,
      state,
      streamResponse,
    ],
  );

  const { saveSession, getLastSessionId, loadLastSession, loadMostRecentChat } =
    useHistory(dispatch, "perplexity");

  const historyKeyRef = useRef(0);
  const sessionKeyRef = useRef(0);

  useWebviewListener(
    "newSession",
    async () => {
      saveSession();
      sessionKeyRef.current += 1;
    },
    [saveSession],
  );

  useWebviewListener(
    "loadMostRecentChat",
    async () => {
      await loadMostRecentChat();
      sessionKeyRef.current += 1;
    },
    [loadMostRecentChat],
  );

  const isLastUserInput = useCallback(
    (index: number): boolean => {
      let foundLaterUserInput = false;
      for (let i = index + 1; i < state.perplexityHistory.length; i++) {
        if (state.perplexityHistory[i].message.role === "user") {
          foundLaterUserInput = true;
          break;
        }
      }
      return !foundLaterUserInput;
    },
    [state.perplexityHistory],
  );

  // force re-render continueInputBox when history changes
  useEffect(() => {
    historyKeyRef.current += 1;
    sessionKeyRef.current += 1;
  }, [state.perplexityHistory]);

  return (
    <>
      <div className="relative flex h-screen overflow-hidden ">
        <InventoryDetails
          textColor="#FFFFFF"
          backgroundColor="#0fb5af"
          content="Search"
          blurb={<div><p>When you need to find information where recency is important. Regular LLMs' knowledge are outdated by several months, whereas PearAI Search is able to search the web for latest data.</p><p>Powered by Perplexity.</p></div>}
          useful={<div><p>Most up-to-date information, real-time web search.</p><p>Also good for non-coding specific questions</p><p>Uses less credits than other tools</p></div>}
          alt={<p>Use Chat or Creator to make changes to files.</p>}
        />

        <HistorySidebar
          isOpen={historySidebarOpen}
          onClose={() => {
            setHistorySidebarOpen(false)
          }}
          from="perplexity"
        />

        <div
          className={cn(
            "flex-1 flex flex-col min-w-0",
            historySidebarOpen ? "mr-72" : "mr-0"
          )}
        >
          <Button
            variant="ghost"
            onClick={() => setHistorySidebarOpen(prev => !prev)}
            className={
              cn(
                "ml-auto mr-0",
                'z-10'
              )
            }
          >
            {!historySidebarOpen && (
              <>
                <ClockIcon className="h-6 w-6" />
              </>
            )}
          </Button>
          <TopGuiDiv ref={topGuiDivRef} onScroll={handleScroll}>

            <div
              className={cn(
                "mx-2",
                state.perplexityHistory.length === 0 &&
                "h-full flex flex-col justify-center",
              )}
            >
              {state.perplexityHistory.length === 0 ? (
                <div className="max-w-2xl mx-auto w-full text-center">
                  <div className="w-full text-center mb-4 flex flex-col md:flex-row lg:flex-row items-center justify-center relative">
                    <div className="flex-1" />
                    <h1 className="text-2xl font-bold mb-2 md:mb-0 lg:mb-0 md:mx-2 lg:mx-0">PearAI Search</h1>
                    <div className="flex-1 flex items-center justify-start">
                      <Badge variant="outline" className="lg:relative lg:top-[2px]">
                        Beta (Powered by Perplexity*)
                      </Badge>
                    </div>
                  </div>
                  <p className="text-sm text-foreground">
                    Ask for anything. We'll retrieve up-to-date information in
                    real-time on the web. Search uses less credits than PearAI Chat,
                    and is perfect for documentation lookups.
                  </p>
                </div>
              ) : (
                <div className="pl-2">
                  <div className="flex items-center gap-2">
                    <h1 className="text-2xl font-bold mb-2">PearAI Search</h1>
                    <Badge variant="outline" className="pl-0">
                      Beta (Powered by Perplexity*)
                    </Badge>
                  </div>
                  <div className="flex items-center mt-0 justify-between pr-1">
                    <p className="text-sm text-foreground m-0">
                      Ask for anything. We'll retrieve up-to-date information in
                      real-time on the web. Search uses less credits than PearAI
                      Chat, and is perfect for documentation lookups.
                    </p>
                    <div>
                      <div>
                      </div>
                    </div>
                    <div>
                      <NewSessionButton
                        onClick={() => {
                          saveSession();
                          sessionKeyRef.current += 1;
                        }}
                        className="mr-auto"
                      >
                        Clear chat (<kbd>{getMetaKeyLabel()}</kbd> <kbd>.</kbd>)
                      </NewSessionButton>
                    </div>
                  </div>
                </div>
              )}
              <div className="max-w-3xl mx-auto w-full px-4 mt-6">
                <StepsDiv>
                  {state.perplexityHistory.map((item, index: number) => (
                    <Fragment key={index}>
                      <ErrorBoundary
                        FallbackComponent={fallbackRender}
                        onReset={() => {
                          dispatch(
                            newSession({ session: undefined, source: "perplexity" }),
                          );
                        }}
                      >
                        {item.message.role === "user" ? (
                          <div className="max-w-3xl mx-auto">
                            <div className="max-w-96 ml-auto px-2">
                              <ContinueInputBox
                                key={historyKeyRef.current}
                                onEnter={async (editorState, modifiers) => {
                                  streamResponse(
                                    editorState,
                                    modifiers,
                                    ideMessenger,
                                    index,
                                    "perplexity",
                                  );
                                }}
                                isLastUserInput={isLastUserInput(index)}
                                isMainInput={false}
                                editorState={item.editorState}
                                contextItems={item.contextItems}
                                source="perplexity"
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="thread-message">
                            <TimelineItem
                              item={item}
                              iconElement={
                                <ChatBubbleOvalLeftIcon width="16px" height="16px" />
                              }
                              open={
                                typeof stepsOpen[index] === "undefined"
                                  ? true
                                  : stepsOpen[index]!
                              }
                              onToggle={() => { }}
                            >
                              {item.citations &&
                                <Citations
                                  citations={item.citations}
                                  isLast={
                                    index === sessionState.perplexityHistory.length - 1
                                  }
                                  active={active}
                                />}
                              <StepContainer
                                index={index}
                                isLast={
                                  index === sessionState.perplexityHistory.length - 1
                                }
                                isFirst={index === 0}
                                open={
                                  typeof stepsOpen[index] === "undefined"
                                    ? true
                                    : stepsOpen[index]!
                                }
                                key={index}
                                onUserInput={(input: string) => { }}
                                item={item}
                                onReverse={() => { }}
                                onRetry={() => {
                                  streamResponse(
                                    state.perplexityHistory[index - 1].editorState,
                                    state.perplexityHistory[index - 1].modifiers ??
                                    defaultInputModifiers,
                                    ideMessenger,
                                    index - 1,
                                    "perplexity",
                                  );
                                }}
                                onContinueGeneration={() => {
                                  window.postMessage(
                                    {
                                      messageType: "userInput",
                                      data: {
                                        input: "Keep going.",
                                      },
                                    },
                                    "*",
                                  );
                                }}
                                onDelete={() => {
                                  dispatch(
                                    deleteMessage({
                                      index: index,
                                      source: "perplexity",
                                    }),
                                  );
                                }}
                                modelTitle={
                                  item.promptLogs?.[0]?.completionOptions?.model ?? ""
                                }
                                source="perplexity"
                              />
                            </TimelineItem>
                          </div>
                        )}
                      </ErrorBoundary>
                    </Fragment>
                  ))}
                </StepsDiv>

                {!active && <div
                  className={cn(
                    state.perplexityHistory.length === 0
                      ? "max-w-2xl mx-auto w-full"
                      : "w-full",
                  )}
                >
                  <ContinueInputBox
                    key={sessionKeyRef.current}
                    onEnter={(editorContent, modifiers) => {
                      sendInput(editorContent, modifiers);
                    }}
                    isLastUserInput={false}
                    isMainInput={true}
                    hidden={active}
                    source="perplexity"
                    className={cn(
                      state.perplexityHistory.length === 0 && "shadow-lg",
                    )}
                  />
                </div>}

                {active ? (
                  <>
                    <br />
                    <br />
                  </>
                ) : state.perplexityHistory.length > 0 ? (
                  <div className="mt-2">
                    <NewSessionButton
                      onClick={() => {
                        saveSession();
                        sessionKeyRef.current += 1;
                      }}
                      className="mr-auto"
                    >
                      Clear chat (<kbd>{getMetaKeyLabel()}</kbd> <kbd>.</kbd>)
                    </NewSessionButton>
                  </div>
                ) : (
                  <>
                    {" "}
                    {/** TODO: Prevent removing tutorial card for now. Set to showerPerplexityTutorialCard later */}
                    {true && (
                      <div className="flex justify-center w-full mt-10">
                        <CustomTutorialCard
                          content={tutorialContent}
                          onClose={onCloseTutorialCard}
                        />{" "}
                      </div>
                    )}
                  </>
                )}
              </div>

              <ChatScrollAnchor
                scrollAreaRef={topGuiDivRef}
                isAtBottom={isAtBottom}
                trackVisibility={active}
              />
            </div>
          </TopGuiDiv>
        </div>
      </div>
      {active && (
        <StopButtonContainer>
          <StopButton
            className="mt-auto mb-24 sticky bottom-4"
            onClick={() => {
              dispatch(setPerplexityInactive());
              if (
                state.perplexityHistory[state.perplexityHistory.length - 1]
                  ?.message.content.length === 0
              ) {
                dispatch(clearLastResponse("perplexity"));
              }
            }}
          >
            {getMetaKeyLabel()} ⌫ Cancel
          </StopButton>
        </StopButtonContainer>
      )}

      <div className="text-[10px] text-muted-foreground mb-4 flex justify-end pr-2 pb-2">
        *View PearAI Disclaimer page{" "}
        <Link
          to="https://trypear.ai/disclaimer/"
          target="_blank"
          className="text-muted-foreground no-underline hover:no-underline ml-1"
        >
          here
        </Link>
        .
      </div>
    </>
  );
}

const tutorialContent = {
  goodFor: "Searching documentation, debugging errors, quick look-ups",
  notGoodFor: "Direct feature implementations (use PearAI Creator instead)",
  example: {
    text: '"What\'s new in the latest python version?"',
    copyText: "What's new in the latest python version?",
  },
};

export default PerplexityGUI;
