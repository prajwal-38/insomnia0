import useStore from "../store/use-store";

const MediaBackground = ({ background }: { background?: string }) => {
  const { backgroundColor = "#000000" } = useStore();

  return (
    <div
      style={{
        height: "10000px",
        width: "10000px",
        background: background || backgroundColor,
        top: -2500,
        left: -2500,
        position: "fixed",
        pointerEvents: "none",
      }}
    ></div>
  );
};

export default MediaBackground;
