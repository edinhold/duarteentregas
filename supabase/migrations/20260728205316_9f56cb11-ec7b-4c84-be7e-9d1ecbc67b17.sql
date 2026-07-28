DROP TRIGGER IF EXISTS trg_notify_onesignal_on_new_request ON public.delivery_requests;
CREATE TRIGGER trg_notify_onesignal_on_new_request
  AFTER INSERT ON public.delivery_requests
  FOR EACH ROW
  WHEN (NEW.status = 'pending')
  EXECUTE FUNCTION public.notify_onesignal_on_new_request();

DROP TRIGGER IF EXISTS trg_cancel_push_on_accept ON public.delivery_requests;
CREATE TRIGGER trg_cancel_push_on_accept
  AFTER UPDATE OF status ON public.delivery_requests
  FOR EACH ROW
  WHEN (OLD.status = 'pending' AND NEW.status <> 'pending')
  EXECUTE FUNCTION public.cancel_push_on_accept();