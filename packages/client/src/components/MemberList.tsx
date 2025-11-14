export default function MemberList() {
  // 这里可以根据当前频道显示成员列表
  // 暂时返回空组件
  return (
    <div className="w-60 bg-discord-darker border-l border-discord-darkest hidden xl:block">
      <div className="p-4">
        <div className="text-xs font-semibold text-gray-400 mb-2">在线 - 0</div>
        <div className="text-center text-gray-500 py-8 text-sm">暂无成员</div>
      </div>
    </div>
  );
}
