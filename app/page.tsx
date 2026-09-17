import CameraCapture from "@/components/camera/camera-capture";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center gap-6 px-5 py-10">
      <h1 className="text-2xl font-bold">짤 따라하기</h1>
      <CameraCapture />
    </main>
  );
}
