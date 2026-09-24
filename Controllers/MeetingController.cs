using Microsoft.AspNetCore.Mvc;

namespace Rendezvous.Web.Controllers
{
    public class MeetingController : Controller
    {
        [HttpGet]
        public IActionResult Create()
        {
            return View();
        }
    }
}