import "./ReviewModal.css";

export default function ReviewModal({ open }) {
  if (!open) return null;
  return (
    <div className="review-modal__overlay">
      <div className="review-modal__box">
        <div className="review-modal__spinner" />
        <p className="review-modal__text">正在审核内容，请稍候...</p>
      </div>
    </div>
  );
}
