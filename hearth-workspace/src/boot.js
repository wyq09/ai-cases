/* ==========================================================================
   Hearth — view registry & boot (must stay last)
   ========================================================================== */

VIEWS.chat = renderChat;
VIEWS.goals = renderGoals;
VIEWS.files = renderFiles;
VIEWS.tasks = renderTasks;
VIEWS.calendar = renderCalendar;
VIEWS.memory = renderMemory;

restore();
applyTheme();
if (state.rail) appEl.classList.add("is-rail");
if (state.settings.reduceMotion) document.documentElement.setAttribute("data-reduce-motion", "");

window.addEventListener("hashchange", () => {
  const r = currentRoute();
  if (r !== state.route) {
    state.prevRoute = state.route;
    state.route = r;
    render();
  }
});

state.route = currentRoute();
render();

/* Public handle for automated regression tests. */
window.Hearth = {
  state,
  VIEWS,
  render,
  go,
  toast,
  openModal,
  openMenu,
  openDrawer,
  openCmdk,
  closeLayer,
  formatReply,
  pickReply,
  replyFor,
  streamInto,
  ART,
  persist,
  sendChat,
  startPrompt,
};
