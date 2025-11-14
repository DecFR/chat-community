export default function WelcomeScreen() {
  return (
    <div className="flex-1 flex items-center justify-center bg-discord-dark">
      <div className="text-center px-8">
        <div className="mb-6">
          <svg
            className="w-24 h-24 mx-auto text-discord-light-gray opacity-50"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-white mb-3">欢迎来到聊天社区!</h2>
        <p className="text-discord-light-gray text-lg mb-2">
          选择左侧的服务器或好友开始聊天
        </p>
        <p className="text-gray-500 text-sm">
          在左侧好友列表中点击好友即可开始私聊
        </p>
      </div>
    </div>
  );
}
